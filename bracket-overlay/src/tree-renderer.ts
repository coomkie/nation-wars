import * as d3 from 'd3';

export interface BracketNodeDto {
  id: string;
  round: number;
  nationId: string | null;
  leftChildId: string | null;
  rightChildId: string | null;
  matchId: string | null;
  isBye: boolean;
}

export interface BracketDto {
  id: string;
  rootNodeId: string;
  nodes: BracketNodeDto[];
  championNationId: string | null;
  createdAt: string;
  status: 'active' | 'completed';
}

export interface NationMeta {
  id: string;
  name: string;
  flagUrl: string;
}

interface HierarchyNode {
  id: string;
  label: string;
  isChampion: boolean;
  isBye: boolean;
  nationId: string | null;
  children?: HierarchyNode[];
}

export function renderBracketTree(
  svgEl: SVGSVGElement,
  bracket: BracketDto,
  nations: Map<string, NationMeta>,
) {
  const byId = new Map(bracket.nodes.map((n) => [n.id, n]));

  function toHierarchy(nodeId: string): HierarchyNode {
    const node = byId.get(nodeId)!;
    const nation = node.nationId ? nations.get(node.nationId) : null;
    const label = node.isBye && !node.nationId
      ? 'BYE'
      : nation?.name ?? (node.nationId ? node.nationId.slice(0, 6) : 'TBD');

    const children: HierarchyNode[] = [];
    if (node.leftChildId) children.push(toHierarchy(node.leftChildId));
    if (node.rightChildId) children.push(toHierarchy(node.rightChildId));

    return {
      id: node.id,
      label,
      isChampion: bracket.championNationId === node.nationId && node.id === bracket.rootNodeId,
      isBye: node.isBye,
      nationId: node.nationId,
      children: children.length ? children : undefined,
    };
  }

  const rootData = toHierarchy(bracket.rootNodeId);
  const root = d3.hierarchy(rootData);
  const treeLayout = d3.tree<HierarchyNode>().nodeSize([90, 220]);
  treeLayout(root);

  const nodes = root.descendants();
  const links = root.links();

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x!);
    maxX = Math.max(maxX, n.x!);
    minY = Math.min(minY, n.y!);
    maxY = Math.max(maxY, n.y!);
  }

  const pad = 80;
  const width = maxY - minY + pad * 2 + 200;
  const height = maxX - minX + pad * 2 + 80;

  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  svg.attr('viewBox', `0 0 ${width} ${height}`);

  const g = svg.append('g').attr('transform', `translate(${pad - minY},${pad - minX})`);

  // Zoom / pan
  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.3, 3])
    .on('zoom', (event) => {
      g.attr(
        'transform',
        `translate(${event.transform.x + pad - minY},${event.transform.y + pad - minX}) scale(${event.transform.k})`,
      );
    });
  svg.call(zoom as any);

  g.selectAll('path.link')
    .data(links)
    .join('path')
    .attr('fill', 'none')
    .attr('stroke', 'rgba(255,255,255,0.45)')
    .attr('stroke-width', 2)
    .attr(
      'd',
      d3
        .linkHorizontal<any, any>()
        .x((d) => d.y)
        .y((d) => d.x) as any,
    );

  const node = g
    .selectAll('g.node')
    .data(nodes)
    .join('g')
    .attr('class', 'node')
    .attr('transform', (d) => `translate(${d.y},${d.x})`);

  node
    .append('rect')
    .attr('x', -70)
    .attr('y', -22)
    .attr('width', 140)
    .attr('height', 44)
    .attr('rx', 8)
    .attr('fill', (d) =>
      d.data.isChampion
        ? '#f59e0b'
        : d.data.isBye && !d.data.nationId
          ? 'rgba(100,100,100,0.7)'
          : 'rgba(15,23,42,0.85)',
    )
    .attr('stroke', (d) => (d.data.isChampion ? '#fde68a' : '#94a3b8'))
    .attr('stroke-width', (d) => (d.data.isChampion ? 3 : 1.5));

  node
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .attr('fill', '#fff')
    .attr('font-size', 14)
    .attr('font-weight', 600)
    .text((d) =>
      d.data.isChampion ? `👑 ${d.data.label}` : d.data.label,
    );
}
