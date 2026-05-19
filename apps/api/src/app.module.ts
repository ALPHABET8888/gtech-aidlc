import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@autoflow/shared-prisma';
import { AuthModule } from '@autoflow/shared-auth';
import { WarehouseModule } from '@autoflow/warehouse-feature';
import { AppController } from './app.controller';
import { ApiAuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    ApiAuthModule,
    WarehouseModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
