import { describe, expect, test } from "@odoo/hoot";

import { getFirstListFunction, getNumberOfListFormulas } from "@spreadsheet/list/list_helpers";
import { constants, tokenize, helpers } from "@odoo/o-spreadsheet";
import { patchTranslations } from "@web/../tests/web_test_helpers";
const {
    getFirstPivotFunction,
    getNumberOfPivotFunctions,
    pivotTimeAdapter,
    toNormalizedPivotValue,
} = helpers;
const { DEFAULT_LOCALE } = constants;

function stringArg(value) {
    return { type: "STRING", value: `${value}` };
}

describe.current.tags("headless");

describe("pivot_helpers", () => {
    test("Basic formula extractor", async function () {
        const formula = `=PIVOT.VALUE("1", "test") + ODOO.LIST("2", "hello", "bla")`;
        const tokens = tokenize(formula);
        let functionName;
        let args;
        ({ functionName, args } = getFirstPivotFunction(tokens));
        expect(functionName).toBe("PIVOT.VALUE");
        expect(args.length).toBe(2);
        expect(args[0]).toEqual(stringArg("1"));
        expect(args[1]).toEqual(stringArg("test"));
        ({ functionName, args } = getFirstListFunction(tokens));
        expect(functionName).toBe("ODOO.LIST");
        expect(args.length).toBe(3);
        expect(args[0]).toEqual(stringArg("2"));
        expect(args[1]).toEqual(stringArg("hello"));
        expect(args[2]).toEqual(stringArg("bla"));
    });

    test("Extraction with two PIVOT formulas", async function () {
        const formula = `=PIVOT.VALUE("1", "test") + PIVOT.VALUE("2", "hello", "bla")`;
        const tokens = tokenize(formula);
        const { functionName, args } = getFirstPivotFunction(tokens);
        expect(functionName).toBe("PIVOT.VALUE");
        expect(args.length).toBe(2);
        expect(args[0]).toEqual(stringArg("1"));
        expect(args[1]).toEqual(stringArg("test"));
        expect(getFirstListFunction(tokens)).toBe(undefined);
    });

    test("Number of formulas", async function () {
        const formula = `=PIVOT.VALUE("1", "test") + PIVOT.VALUE("2", "hello", "bla") + ODOO.LIST("1", "bla")`;
        expect(getNumberOfPivotFunctions(tokenize(formula))).toBe(2);
        expect(getNumberOfListFormulas(tokenize(formula))).toBe(1);
        expect(getNumberOfPivotFunctions(tokenize("=1+1"))).toBe(0);
        expect(getNumberOfListFormulas(tokenize("=1+1"))).toBe(0);
        expect(getNumberOfPivotFunctions(tokenize("=bla"))).toBe(0);
        expect(getNumberOfListFormulas(tokenize("=bla"))).toBe(0);
    });

    test("getFirstPivotFunction does not crash when given crap", async function () {
        expect(getFirstListFunction(tokenize("=SUM(A1)"))).toBe(undefined);
        expect(getFirstPivotFunction(tokenize("=SUM(A1)"))).toBe(undefined);
        expect(getFirstListFunction(tokenize("=1+1"))).toBe(undefined);
        expect(getFirstPivotFunction(tokenize("=1+1"))).toBe(undefined);
        expect(getFirstListFunction(tokenize("=bla"))).toBe(undefined);
        expect(getFirstPivotFunction(tokenize("=bla"))).toBe(undefined);
        expect(getFirstListFunction(tokenize("bla"))).toBe(undefined);
        expect(getFirstPivotFunction(tokenize("bla"))).toBe(undefined);
    });
});

describe("toNormalizedPivotValue", () => {
    test("parse values of a selection, char or text field", () => {
        for (const fieldType of ["selection", "text", "char"]) {
            const dimension = {
                type: fieldType,
                displayName: "A field",
                name: "my_field_name",
            };
            expect(toNormalizedPivotValue(dimension, "won")).toBe("won");
            expect(toNormalizedPivotValue(dimension, "1")).toBe("1");
            expect(toNormalizedPivotValue(dimension, 1)).toBe("1");
            expect(toNormalizedPivotValue(dimension, "11/2020")).toBe("11/2020");
            expect(toNormalizedPivotValue(dimension, "2020")).toBe("2020");
            expect(toNormalizedPivotValue(dimension, "01/11/2020")).toBe("01/11/2020");
            expect(toNormalizedPivotValue(dimension, "false")).toBe(false);
            expect(toNormalizedPivotValue(dimension, false)).toBe(false);
            expect(toNormalizedPivotValue(dimension, "true")).toBe("true");
        }
    });

    test("parse values of time fields", () => {
        for (const fieldType of ["date", "datetime"]) {
            const dimension = {
                type: fieldType,
                displayName: "A field",
                name: "my_field_name",
            };

            dimension.granularity = "day";
            expect(toNormalizedPivotValue(dimension, "1/11/2020")).toBe("01/11/2020");
            expect(toNormalizedPivotValue(dimension, "01/11/2020")).toBe("01/11/2020");
            expect(toNormalizedPivotValue(dimension, "11/2020")).toBe("11/01/2020");
            expect(toNormalizedPivotValue(dimension, "1")).toBe("12/31/1899");
            expect(toNormalizedPivotValue(dimension, 1)).toBe("12/31/1899");
            expect(toNormalizedPivotValue(dimension, "false")).toBe(false);
            expect(toNormalizedPivotValue(dimension, false)).toBe(false);

            dimension.granularity = "week";
            expect(toNormalizedPivotValue(dimension, "11/2020")).toBe("11/2020");
            expect(toNormalizedPivotValue(dimension, "1/2020")).toBe("1/2020");
            expect(toNormalizedPivotValue(dimension, "01/2020")).toBe("1/2020");
            expect(toNormalizedPivotValue(dimension, "false")).toBe(false);
            expect(toNormalizedPivotValue(dimension, false)).toBe(false);

            dimension.granularity = "month";
            expect(toNormalizedPivotValue(dimension, "11/2020")).toBe("11/2020");
            expect(toNormalizedPivotValue(dimension, "1/2020")).toBe("01/2020");
            expect(toNormalizedPivotValue(dimension, "01/2020")).toBe("01/2020");
            expect(toNormalizedPivotValue(dimension, "2/11/2020")).toBe("02/2020");
            expect(toNormalizedPivotValue(dimension, "2/1/2020")).toBe("02/2020");
            expect(toNormalizedPivotValue(dimension, 1)).toBe("12/1899");
            expect(toNormalizedPivotValue(dimension, "false")).toBe(false);
            expect(toNormalizedPivotValue(dimension, false)).toBe(false);
            expect(() => toNormalizedPivotValue(dimension, "true")).toThrow();
            expect(() => toNormalizedPivotValue(dimension, true)).toThrow();
            expect(() => toNormalizedPivotValue(dimension, "won")).toThrow();

            dimension.granularity = "year";
            expect(toNormalizedPivotValue(dimension, "2020")).toBe(2020);
            expect(toNormalizedPivotValue(dimension, 2020)).toBe(2020);
            expect(toNormalizedPivotValue(dimension, "false")).toBe(false);
            expect(toNormalizedPivotValue(dimension, false)).toBe(false);
        }
    });

    test("parse values of boolean field", () => {
        const dimension = {
            type: "boolean",
            displayName: "A field",
            name: "my_field_name",
        };
        expect(toNormalizedPivotValue(dimension, "false")).toBe(false);
        expect(toNormalizedPivotValue(dimension, false)).toBe(false);
        expect(toNormalizedPivotValue(dimension, "true")).toBe(true);
        expect(toNormalizedPivotValue(dimension, true)).toBe(true);
        expect(() => toNormalizedPivotValue(dimension, "11/2020")).toThrow();
        expect(() => toNormalizedPivotValue(dimension, "2020")).toThrow();
        expect(() => toNormalizedPivotValue(dimension, "01/11/2020")).toThrow();
        expect(() => toNormalizedPivotValue(dimension, "1")).toThrow();
        expect(() => toNormalizedPivotValue(dimension, 1)).toThrow();
        expect(() => toNormalizedPivotValue(dimension, "won")).toThrow();
    });

    test("parse values of numeric fields", () => {
        for (const fieldType of ["float", "integer", "monetary", "many2one", "many2many"]) {
            const dimension = {
                type: fieldType,
                displayName: "A field",
                name: "my_field_name",
            };
            expect(toNormalizedPivotValue(dimension, "2020")).toBe(2020);
            expect(toNormalizedPivotValue(dimension, "01/11/2020")).toBe(43841); // a date is actually a number in a spreadsheet
            expect(toNormalizedPivotValue(dimension, "11/2020")).toBe(44136); // 1st of november 2020
            expect(toNormalizedPivotValue(dimension, "1")).toBe(1);
            expect(toNormalizedPivotValue(dimension, 1)).toBe(1);
            expect(toNormalizedPivotValue(dimension, "false")).toBe(false);
            expect(toNormalizedPivotValue(dimension, false)).toBe(false);
            expect(() => toNormalizedPivotValue(dimension, "true")).toThrow();
            expect(() => toNormalizedPivotValue(dimension, true)).toThrow();
            expect(() => toNormalizedPivotValue(dimension, "won")).toThrow();
        }
    });

    test("parse values of unsupported fields", () => {
        for (const fieldType of ["one2many", "binary", "html"]) {
            const dimension = {
                type: fieldType,
                displayName: "A field",
                name: "my_field_name",
            };
            expect(() => toNormalizedPivotValue(dimension, "false")).toThrow();
            expect(() => toNormalizedPivotValue(dimension, false)).toThrow();
            expect(() => toNormalizedPivotValue(dimension, "true")).toThrow();
            expect(() => toNormalizedPivotValue(dimension, true)).toThrow();
            expect(() => toNormalizedPivotValue(dimension, "11/2020")).toThrow();
            expect(() => toNormalizedPivotValue(dimension, "2020")).toThrow();
            expect(() => toNormalizedPivotValue(dimension, "01/11/2020")).toThrow();
            expect(() => toNormalizedPivotValue(dimension, "1")).toThrow();
            expect(() => toNormalizedPivotValue(dimension, 1)).toThrow();
            expect(() => toNormalizedPivotValue(dimension, "won")).toThrow();
        }
    });
});

describe("pivot time adapters formatted value", () => {
    test("Day adapter", () => {
        const adapter = pivotTimeAdapter("day");
        expect(adapter.formatValue("11/12/2020", DEFAULT_LOCALE)).toBe("11/12/2020");
        expect(adapter.formatValue("01/11/2020", DEFAULT_LOCALE)).toBe("1/11/2020");
        expect(adapter.formatValue("12/05/2020", DEFAULT_LOCALE)).toBe("12/5/2020");
    });

    test("Week adapter", () => {
        patchTranslations();
        const adapter = pivotTimeAdapter("week");
        expect(adapter.formatValue("5/2024", DEFAULT_LOCALE)).toBe("W5 2024");
        expect(adapter.formatValue("51/2020", DEFAULT_LOCALE)).toBe("W51 2020");
    });

    test("Month adapter", () => {
        patchTranslations();
        const adapter = pivotTimeAdapter("month");
        expect(adapter.formatValue("12/2020", DEFAULT_LOCALE)).toBe("December 2020");
        expect(adapter.formatValue("02/2020", DEFAULT_LOCALE)).toBe("February 2020");
    });

    test("Quarter adapter", () => {
        patchTranslations();
        const adapter = pivotTimeAdapter("quarter");
        expect(adapter.formatValue("1/2022", DEFAULT_LOCALE)).toBe("Q1 2022");
        expect(adapter.formatValue("3/1998", DEFAULT_LOCALE)).toBe("Q3 1998");
    });

    test("Year adapter", () => {
        const adapter = pivotTimeAdapter("year");
        expect(adapter.formatValue("2020", DEFAULT_LOCALE)).toBe("2020");
        expect(adapter.formatValue("1997", DEFAULT_LOCALE)).toBe("1997");
    });
});
