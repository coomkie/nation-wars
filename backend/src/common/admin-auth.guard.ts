import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const expected = this.config.get<string>('ADMIN_PASSWORD') ?? 'changeme';

    const headerPassword = req.header('x-admin-password');
    if (headerPassword && headerPassword === expected) {
      return true;
    }

    const auth = req.header('authorization');
    if (auth?.startsWith('Basic ')) {
      const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
      const colon = decoded.indexOf(':');
      const password = colon >= 0 ? decoded.slice(colon + 1) : decoded;
      if (password === expected) {
        return true;
      }
    }

    throw new UnauthorizedException('Invalid admin password');
  }
}
