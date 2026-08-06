import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Bracket } from './bracket.entity';
import { BracketNode } from './bracket-node.entity';
import { BracketDto, BracketNodeDto } from '../common/types';
import { BracketGateway } from './bracket.gateway';

@Injectable()
export class BracketService implements OnModuleInit {
  constructor(
    @InjectRepository(Bracket)
    private readonly brackets: Repository<Bracket>,
    @InjectRepository(BracketNode)
    private readonly nodes: Repository<BracketNode>,
    private readonly gateway: BracketGateway,
  ) {}

  async onModuleInit() {
    const active = await this.getActive();
    if (active) {
      this.gateway.setLatest(active);
    }
  }

  async getActive(): Promise<BracketDto | null> {
    const bracket = await this.brackets.findOne({
      where: { status: 'active' },
    });
    if (!bracket) return null;
    bracket.nodes = await this.nodes.find({ where: { bracketId: bracket.id } });
    return this.toDto(bracket);
  }

  /** Active bracket, or most recently completed one (for overlay after champion). */
  async getLatest(): Promise<BracketDto | null> {
    const active = await this.getActive();
    if (active) return active;
    const bracket = await this.brackets.findOne({
      where: { status: 'completed' },
      order: { createdAt: 'DESC' },
    });
    if (!bracket) return null;
    bracket.nodes = await this.nodes.find({ where: { bracketId: bracket.id } });
    return this.toDto(bracket);
  }

  async getById(id: string): Promise<BracketDto> {
    const bracket = await this.brackets.findOne({ where: { id } });
    if (!bracket) {
      throw new NotFoundException(`Bracket ${id} not found`);
    }
    bracket.nodes = await this.nodes.find({ where: { bracketId: bracket.id } });
    return this.toDto(bracket);
  }

  async create(nationIds: string[]): Promise<BracketDto> {
    if (nationIds.length < 2) {
      throw new BadRequestException('Need at least 2 nations to create a bracket');
    }

    const active = await this.brackets.findOne({ where: { status: 'active' } });
    if (active) {
      throw new BadRequestException(
        'An active bracket already exists. Complete or archive it before creating a new one. New nations cannot join a mid-tournament bracket.',
      );
    }

    const unique = [...new Set(nationIds)];
    if (unique.length !== nationIds.length) {
      throw new BadRequestException('Duplicate nation IDs in bracket');
    }

    const generated = this.generateTree(unique);
    const bracket = this.brackets.create({
      id: randomUUID(),
      rootNodeId: generated.rootNodeId,
      championNationId: null,
      status: 'active',
      nodes: generated.nodes,
    });

    // Assign bracketId on nodes
    for (const node of bracket.nodes) {
      node.bracketId = bracket.id;
    }

    const saved = await this.brackets.save(bracket);
    const dto = this.toDto(saved);
    this.gateway.emitBracketInit(dto);
    return dto;
  }

  /**
   * Single-elimination bracket. Leaves hold nations (and byes).
   * round 0 = final/root; higher rounds = earlier rounds.
   */
  generateTree(nationIds: string[]): {
    rootNodeId: string;
    nodes: BracketNode[];
  } {
    const size = nationIds.length;
    const bracketSize = 1 << Math.ceil(Math.log2(size));
    const byeCount = bracketSize - size;

    // Pad with byes at the end of the leaf list
    const leaves: Array<{ nationId: string | null; isBye: boolean }> = [
      ...nationIds.map((id) => ({ nationId: id, isBye: false })),
      ...Array.from({ length: byeCount }, () => ({
        nationId: null as string | null,
        isBye: true,
      })),
    ];

    const nodes: BracketNode[] = [];
    const leafRound = Math.log2(bracketSize);

    // Create leaf nodes
    let currentLevel: BracketNode[] = leaves.map((leaf) => {
      const node = new BracketNode();
      node.id = randomUUID();
      node.round = leafRound;
      node.nationId = leaf.isBye ? null : leaf.nationId;
      node.leftChildId = null;
      node.rightChildId = null;
      node.matchId = null;
      node.isBye = leaf.isBye;
      // Bye leaf auto-advances as empty slot — parent will get the sibling
      return node;
    });
    nodes.push(...currentLevel);

    // Build upward to root
    for (let round = leafRound - 1; round >= 0; round--) {
      const parents: BracketNode[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = currentLevel[i + 1];
        const parent = new BracketNode();
        parent.id = randomUUID();
        parent.round = round;
        parent.leftChildId = left.id;
        parent.rightChildId = right.id;
        parent.matchId = null;
        parent.isBye = false;
        parent.nationId = null;

        // Auto-advance byes: if one child is a bye leaf with no nation, advance the other
        if (left.isBye && !left.nationId && right.nationId) {
          parent.nationId = right.nationId;
          parent.isBye = true;
        } else if (right.isBye && !right.nationId && left.nationId) {
          parent.nationId = left.nationId;
          parent.isBye = true;
        } else if (left.isBye && !left.nationId && right.isBye && !right.nationId) {
          parent.isBye = true;
          parent.nationId = null;
        }

        parents.push(parent);
      }
      nodes.push(...parents);
      currentLevel = parents;
    }

    // Propagate bye advances up further if a parent already has nationId from bye
    this.propagateByeWins(nodes);

    const root = currentLevel[0];
    return { rootNodeId: root.id, nodes };
  }

  private propagateByeWins(nodes: BracketNode[]): void {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    // Process from highest round down to 0
    const sorted = [...nodes].sort((a, b) => b.round - a.round);
    for (const node of sorted) {
      if (!node.leftChildId || !node.rightChildId) continue;
      if (node.nationId) continue;
      const left = byId.get(node.leftChildId);
      const right = byId.get(node.rightChildId);
      if (!left || !right) continue;

      const leftReady = left.nationId !== null;
      const rightReady = right.nationId !== null;
      const leftBye = left.isBye && !left.nationId;
      const rightBye = right.isBye && !right.nationId;

      if (leftReady && rightBye) {
        node.nationId = left.nationId;
        node.isBye = true;
      } else if (rightReady && leftBye) {
        node.nationId = right.nationId;
        node.isBye = true;
      }
    }
  }

  async linkMatch(nodeId: string, matchId: string): Promise<BracketDto> {
    const node = await this.nodes.findOne({ where: { id: nodeId } });
    if (!node) {
      throw new NotFoundException(`Bracket node ${nodeId} not found`);
    }
    node.matchId = matchId;
    await this.nodes.save(node);
    return this.emitUpdate(node.bracketId);
  }

  async getNode(nodeId: string): Promise<BracketNode> {
    const node = await this.nodes.findOne({ where: { id: nodeId } });
    if (!node) {
      throw new NotFoundException(`Bracket node ${nodeId} not found`);
    }
    return node;
  }

  /** Resolve child nation IDs for a pending match node */
  async getMatchupNations(nodeId: string): Promise<{
    nationAId: string;
    nationBId: string;
  }> {
    const node = await this.getNode(nodeId);
    if (!node.leftChildId || !node.rightChildId) {
      throw new BadRequestException('Leaf nodes cannot host matches');
    }
    if (node.nationId) {
      throw new BadRequestException('This bracket node already has a winner');
    }
    const left = await this.getNode(node.leftChildId);
    const right = await this.getNode(node.rightChildId);
    if (!left.nationId || !right.nationId) {
      throw new BadRequestException(
        'Both child nodes must have advanced nations before starting this match',
      );
    }
    return { nationAId: left.nationId, nationBId: right.nationId };
  }

  async advanceWinner(
    nodeId: string,
    winnerNationId: string,
    matchId: string,
  ): Promise<BracketDto> {
    // Use update() to avoid TypeORM identity-map stale reads
    const existing = await this.getNode(nodeId);
    await this.nodes.update(nodeId, {
      nationId: winnerNationId,
      matchId,
      isBye: false,
    });

    const bracketId = existing.bracketId;
    const nodes = await this.nodes.find({ where: { bracketId } });
    const bracket = await this.brackets.findOne({ where: { id: bracketId } });
    if (!bracket) {
      throw new NotFoundException('Bracket not found');
    }
    bracket.nodes = nodes;

    if (nodeId === bracket.rootNodeId) {
      bracket.championNationId = winnerNationId;
      bracket.status = 'completed';
      await this.brackets.save(bracket);
      const dto = this.toDto(bracket);
      this.gateway.emitBracketUpdate(dto);
      this.gateway.emitChampion(winnerNationId);
      return dto;
    }

    const dto = this.toDto(bracket);
    this.gateway.emitBracketUpdate(dto);
    return dto;
  }

  /**
   * Next matchable node: both children have nations, node has no winner yet.
   * Prefer outer rounds (higher `round`) so all first-round games finish before finals.
   */
  async findNextPlayableNode(): Promise<{
    nodeId: string;
    nationAId: string;
    nationBId: string;
  } | null> {
    const bracket = await this.brackets.findOne({
      where: { status: 'active' },
    });
    if (!bracket) return null;

    const nodes = await this.nodes.find({ where: { bracketId: bracket.id } });
    const byId = new Map(nodes.map((n) => [n.id, n]));

    const candidates = nodes
      .filter(
        (n) =>
          !n.nationId &&
          n.leftChildId &&
          n.rightChildId &&
          byId.get(n.leftChildId)?.nationId &&
          byId.get(n.rightChildId)?.nationId,
      )
      .sort((a, b) => b.round - a.round || a.id.localeCompare(b.id));

    const node = candidates[0];
    if (!node?.leftChildId || !node.rightChildId) return null;

    return {
      nodeId: node.id,
      nationAId: byId.get(node.leftChildId)!.nationId!,
      nationBId: byId.get(node.rightChildId)!.nationId!,
    };
  }

  async archiveActive(): Promise<void> {
    const active = await this.brackets.findOne({ where: { status: 'active' } });
    if (active) {
      active.status = 'completed';
      await this.brackets.save(active);
    }
  }

  private async emitUpdate(bracketId: string): Promise<BracketDto> {
    const bracket = await this.brackets.findOne({ where: { id: bracketId } });
    if (!bracket) {
      throw new NotFoundException('Bracket not found');
    }
    bracket.nodes = await this.nodes.find({ where: { bracketId } });
    const dto = this.toDto(bracket);
    this.gateway.emitBracketUpdate(dto);
    return dto;
  }

  toDto(bracket: Bracket): BracketDto {
    const nodes: BracketNodeDto[] = (bracket.nodes ?? []).map((n) => ({
      id: n.id,
      round: n.round,
      nationId: n.nationId,
      leftChildId: n.leftChildId,
      rightChildId: n.rightChildId,
      matchId: n.matchId,
      isBye: n.isBye,
    }));
    return {
      id: bracket.id,
      rootNodeId: bracket.rootNodeId,
      nodes,
      championNationId: bracket.championNationId,
      createdAt: bracket.createdAt?.toISOString?.() ?? String(bracket.createdAt),
      status: bracket.status,
    };
  }
}
