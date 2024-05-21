import { describe, expect, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";
import { createModelWithDataSource } from "@spreadsheet/../tests/helpers/model";
import { defineSpreadsheetModels } from "../helpers/data";

describe.current.tags("headless");

defineSpreadsheetModels();

test("get default currency format when it's in the config", async () => {
    const model = await createModelWithDataSource({
        modelConfig: {
            defaultCurrencyFormat: "#,##0.00[$θ]",
        },
        mockRPC: async function (route, args) {
            throw new Error("Should not make any RPC");
        },
    });
    expect(model.getters.getCompanyCurrencyFormat()).toBe("#,##0.00[$θ]");
});

test("get default currency format when it's not in the config", async () => {
    const model = await createModelWithDataSource({
        mockRPC: async function (route, args) {
            if (args.method === "get_company_currency_for_spreadsheet") {
                return {
                    code: "Odoo",
                    symbol: "θ",
                    position: "after",
                    decimalPlaces: 2,
                };
            }
        },
    });

    expect(() => model.getters.getCompanyCurrencyFormat()).toThrow("Loading...");
    await animationFrame();
    expect(model.getters.getCompanyCurrencyFormat()).toBe("#,##0.00[$θ]");
    expect([]).toVerifySteps();
});

test("get specific currency format", async () => {
    const model = await createModelWithDataSource({
        modelConfig: {
            defaultCurrencyFormat: "#,##0.00[$θ]",
        },
        mockRPC: async function (route, args) {
            if (args.method === "get_company_currency_for_spreadsheet" && args.args[0] === 42) {
                return {
                    code: "Odoo",
                    symbol: "O",
                    position: "after",
                    decimalPlaces: 2,
                };
            }
        },
    });
    expect(() => model.getters.getCompanyCurrencyFormat(42)).toThrow("Loading...");
    await animationFrame();
    expect(model.getters.getCompanyCurrencyFormat(42)).toBe("#,##0.00[$O]");
});
