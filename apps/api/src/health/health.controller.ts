import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: the process answers. No dependencies, so orchestrators don't restart us when the DB blips. */
  @Get()
  @ApiOkResponse({ description: 'API process is up' })
  check() {
    return { status: 'ok' };
  }

  /** Readiness: the database answers. Load balancers route traffic only when this is 200. */
  @Get('ready')
  @ApiOkResponse({ description: 'Database reachable' })
  @ApiServiceUnavailableResponse({ description: 'Database unreachable' })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up' };
    } catch {
      // Details stay in server logs; the probe only needs the verdict.
      throw new ServiceUnavailableException({ message: 'Database unavailable', details: { database: 'down' } });
    }
  }
}
