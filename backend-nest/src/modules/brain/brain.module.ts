import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BrainService } from './brain.service';

@Module({
    imports: [ConfigModule],
    providers: [BrainService],
    exports: [BrainService],
})
export class BrainModule { }
