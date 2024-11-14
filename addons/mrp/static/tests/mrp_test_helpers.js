import { mailModels } from "@mail/../tests/mail_test_helpers";
import { defineModels, mockEmojiLoading } from "@web/../tests/web_test_helpers";
import { ProductDocument } from "@mrp/../tests/mock_server/mock_models/product_document";
import { ResFake } from "@mrp/../tests/mock_server/mock_models/res_fake";

export function defineMrpModels() {
    mockEmojiLoading();
    return defineModels(mrpModels);
}

export const mrpModels = {
    ...mailModels,
    ProductDocument,
    ResFake,
};
