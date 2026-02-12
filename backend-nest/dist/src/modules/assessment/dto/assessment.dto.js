"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubmitPhaseDto = exports.StartAssessmentDto = exports.AssessmentPhase = void 0;
const class_validator_1 = require("class-validator");
var AssessmentPhase;
(function (AssessmentPhase) {
    AssessmentPhase["PHASE_1"] = "PHASE_1";
    AssessmentPhase["PHASE_2"] = "PHASE_2";
    AssessmentPhase["PHASE_3"] = "PHASE_3";
    AssessmentPhase["PHASE_4"] = "PHASE_4";
})(AssessmentPhase || (exports.AssessmentPhase = AssessmentPhase = {}));
class StartAssessmentDto {
}
exports.StartAssessmentDto = StartAssessmentDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], StartAssessmentDto.prototype, "userId", void 0);
class SubmitPhaseDto {
}
exports.SubmitPhaseDto = SubmitPhaseDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], SubmitPhaseDto.prototype, "assessmentId", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(AssessmentPhase),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], SubmitPhaseDto.prototype, "phase", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], SubmitPhaseDto.prototype, "audioBase64", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SubmitPhaseDto.prototype, "attempt", void 0);
//# sourceMappingURL=assessment.dto.js.map