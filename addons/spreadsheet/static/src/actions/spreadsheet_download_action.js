/** @odoo-module */

import { download } from "@web/core/network/download";
import { registry } from "@web/core/registry";
import {
    createSpreadsheetModel,
    waitForDataLoaded,
    getModelXlsxExport,
} from "@spreadsheet/helpers/model";

/**
 * @param {import("@web/env").OdooEnv} env
 * @param {object} action
 */
async function downloadSpreadsheet(env, action) {
    let { name, data, stateUpdateMessages, xlsxData } = action.params;
    if (!xlsxData) {
        const model = await createSpreadsheetModel({ env, data, revisions: stateUpdateMessages });
        await waitForDataLoaded(model);
        xlsxData = getModelXlsxExport(env, model);
        if (!xlsxData) {
            return;
        }
    }
    await download({
        url: "/spreadsheet/xlsx",
        data: {
            zip_name: `${name}.xlsx`,
            files: JSON.stringify(xlsxData.files),
        },
    });
}

registry
    .category("actions")
    .add("action_download_spreadsheet", downloadSpreadsheet, { force: true });
