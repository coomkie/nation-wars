import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { NationModule } from './nation/nation.module';
import { BracketModule } from './bracket/bracket.module';
import { MatchModule } from './match/match.module';
import { LiveListenerModule } from './live-listener/live-listener.module';
import { UnitTypeModule } from './unit-type/unit-type.module';
import { SpritesModule } from './sprites/sprites.module';
import { Nation } from './nation/nation.entity';
import { Bracket } from './bracket/bracket.entity';
import { BracketNode } from './bracket/bracket-node.entity';
import { MatchHistory } from './match/match-history.entity';
import { UnitTypeEntity } from './unit-type/unit-type.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbPath =
          config.get<string>('DATABASE_PATH') ??
          join(process.cwd(), 'nation-wars.sqlite');
        return {
          type: 'better-sqlite3' as const,
          database: dbPath,
          entities: [
            Nation,
            Bracket,
            BracketNode,
            MatchHistory,
            UnitTypeEntity,
          ],
          synchronize: true,
          // Survive concurrent readers (e.g. DB Browser) without instant SQLITE_BUSY
          enableWAL: true,
          timeout: 8000,
          prepareDatabase: (db) => {
            db.pragma('busy_timeout = 8000');
          },
        };
      },
    }),
    NationModule,
    UnitTypeModule,
    BracketModule,
    MatchModule,
    LiveListenerModule,
    SpritesModule,
  ],
})
export class AppModule {}
