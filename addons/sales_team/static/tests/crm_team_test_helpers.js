import { defineModels, mockEmojiLoading } from "@web/../tests/web_test_helpers";
import { mailModels } from "@mail/../tests/mail_test_helpers";

import { CrmTeam } from "./mock_server/mock_models/crm_team";

export function defineCrmTeamModels() {
    mockEmojiLoading();
    return defineModels({ CrmTeam, ...mailModels });
}
