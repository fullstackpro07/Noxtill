"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateVariantSetDto = void 0;
const mapped_types_1 = require("@nestjs/mapped-types");
const create_variant_set_dto_1 = require("./create-variant-set.dto");
class UpdateVariantSetDto extends (0, mapped_types_1.PartialType)(create_variant_set_dto_1.CreateVariantSetDto) {
}
exports.UpdateVariantSetDto = UpdateVariantSetDto;
//# sourceMappingURL=update-variant-set.dto.js.map