import { mailModels } from "@mail/../tests/mail_test_helpers";
import { Partner } from "@sms/../tests/mock_server/mock_models/partner";
import { Visitor } from "@sms/../tests/mock_server/mock_models/visitor";
import { defineModels, mockEmojiLoading } from "@web/../tests/web_test_helpers";

export function defineSMSModels() {
    mockEmojiLoading();
    return defineModels(smsModels);
}

export const smsModels = { ...mailModels, Partner, Visitor };
