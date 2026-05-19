import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '@autoflow/shared-auth';
import { AuthContext, Role } from '@autoflow/shared-types';
import { WriteOffService } from '../services/write-off.service';
import { CreateWriteOffDto } from '../dto/create-write-off.dto';
import { WriteOffQueryDto } from '../dto/write-off-query.dto';

@ApiTags('warehouse / write-off')
@ApiBearerAuth()
@Controller('api/v1/warehouse/write-offs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WriteOffController {
  constructor(private readonly writeOffService: WriteOffService) {}

  @Post()
  @Roles(Role.SUPERVISOR, Role.MANAGER, Role.CFO)
  @ApiOperation({ summary: 'Create a write-off request (evidence must be uploaded before approval)' })
  @ApiResponse({
    status: 201,
    description: 'Write-off request created with PENDING_APPROVAL status',
  })
  @ApiResponse({ status: 400, description: 'Validation error — missing reason or invalid data' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Insufficient role — Supervisor+ required' })
  @ApiResponse({ status: 422, description: 'Insufficient stock for write-off' })
  async create(
    @Body() dto: CreateWriteOffDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.writeOffService.requestWriteOff(dto, user.userId);
  }

  @Post(':id/evidence')
  @Roles(Role.SUPERVISOR, Role.MANAGER, Role.CFO)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (_req, file, callback) => {
        const allowedMimeTypes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf',
        ];
        if (allowedMimeTypes.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(new Error('Invalid file type. Only images and PDFs are allowed.'), false);
        }
      },
    }),
  )
  @ApiOperation({ summary: 'Upload evidence file for a write-off request' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Evidence file (images or PDF, max 10MB)',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  @ApiParam({ name: 'id', description: 'Write-off request ID', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Evidence file uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file type' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Insufficient role — Supervisor+ required' })
  @ApiResponse({ status: 404, description: 'Write-off request not found' })
  @ApiResponse({ status: 413, description: 'File too large — max 10MB' })
  async uploadEvidence(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthContext,
  ) {
    return this.writeOffService.uploadEvidence(id, file, user.userId);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.CFO)
  @ApiOperation({ summary: 'CFO approve write-off — POST ADJ_WRITEOFF transaction' })
  @ApiParam({ name: 'id', description: 'Write-off request ID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Write-off approved and posted — stock decreased, TX recorded',
  })
  @ApiResponse({ status: 400, description: 'No evidence uploaded or invalid state' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Not CFO — only CFO can approve write-offs' })
  @ApiResponse({ status: 404, description: 'Write-off request not found' })
  @ApiResponse({ status: 409, description: 'Write-off not in PENDING_APPROVAL status' })
  async approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext,
  ) {
    return this.writeOffService.approveWriteOff(id, {
      userId: user.userId,
      roles: user.roles,
    });
  }

  @Get()
  @Roles(Role.SUPERVISOR, Role.MANAGER, Role.CFO)
  @ApiOperation({ summary: 'List write-off requests with filters and pagination' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of write-off requests',
  })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Insufficient role — Supervisor+ required' })
  async list(@Query() query: WriteOffQueryDto) {
    const { data, total } = await this.writeOffService.listWriteOffs(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  @Get(':id')
  @Roles(Role.SUPERVISOR, Role.MANAGER, Role.CFO)
  @ApiOperation({ summary: 'Get write-off request detail with evidence' })
  @ApiParam({ name: 'id', description: 'Write-off request ID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Write-off request detail with evidence files' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Insufficient role — Supervisor+ required' })
  @ApiResponse({ status: 404, description: 'Write-off request not found' })
  async getById(@Param('id') id: string) {
    return this.writeOffService.getWriteOff(id);
  }
}
