import { makeServerError } from "@web/../tests/web_test_helpers";
import { animationFrame } from "@odoo/hoot-mock";
import { describe, expect, test } from "@odoo/hoot";

import { OdooBarChart } from "@spreadsheet/chart/odoo_chart/odoo_bar_chart";
import { OdooChart } from "@spreadsheet/chart/odoo_chart/odoo_chart";
import { OdooLineChart } from "@spreadsheet/chart/odoo_chart/odoo_line_chart";

import {
    createSpreadsheetWithChart,
    insertChartInSpreadsheet,
} from "@spreadsheet/../tests/helpers/chart";
import { insertListInSpreadsheet } from "@spreadsheet/../tests/helpers/list";
import { createModelWithDataSource } from "@spreadsheet/../tests/helpers/model";
import { addGlobalFilter } from "@spreadsheet/../tests/helpers/commands";
import { THIS_YEAR_GLOBAL_FILTER } from "@spreadsheet/../tests/helpers/global_filter";
import * as spreadsheet from "@odoo/o-spreadsheet";

import { user } from "@web/core/user";
import {
    getBasicServerData,
    defineSpreadsheetActions,
    defineSpreadsheetModels,
} from "@spreadsheet/../tests/helpers/data";
import { waitForDataLoaded } from "@spreadsheet/helpers/model";

const { toZone } = spreadsheet.helpers;

describe.current.tags("headless");
defineSpreadsheetModels();
defineSpreadsheetActions();

test("Can add an Odoo Bar chart", async () => {
    const { model } = await createSpreadsheetWithChart({ type: "odoo_bar" });
    const sheetId = model.getters.getActiveSheetId();
    expect(model.getters.getChartIds(sheetId).length).toBe(1);
    const chartId = model.getters.getChartIds(sheetId)[0];
    const chart = model.getters.getChart(chartId);
    expect(chart instanceof OdooBarChart).toBe(true);
    expect(chart.getDefinitionForExcel()).toBe(undefined);
    expect(model.getters.getChartRuntime(chartId).chartJsConfig.type).toBe("bar");
});

test("Can add an Odoo Line chart", async () => {
    const { model } = await createSpreadsheetWithChart({ type: "odoo_line" });
    const sheetId = model.getters.getActiveSheetId();
    expect(model.getters.getChartIds(sheetId).length).toBe(1);
    const chartId = model.getters.getChartIds(sheetId)[0];
    const chart = model.getters.getChart(chartId);
    expect(chart instanceof OdooLineChart).toBe(true);
    expect(chart.getDefinitionForExcel()).toBe(undefined);
    expect(model.getters.getChartRuntime(chartId).chartJsConfig.type).toBe("line");
});

test("Can add an Odoo Pie chart", async () => {
    const { model } = await createSpreadsheetWithChart({ type: "odoo_pie" });
    const sheetId = model.getters.getActiveSheetId();
    expect(model.getters.getChartIds(sheetId).length).toBe(1);
    const chartId = model.getters.getChartIds(sheetId)[0];
    const chart = model.getters.getChart(chartId);
    expect(chart instanceof OdooChart).toBe(true);
    expect(chart.getDefinitionForExcel()).toBe(undefined);
    expect(model.getters.getChartRuntime(chartId).chartJsConfig.type).toBe("pie");
});

test("A data source is added after a chart creation", async () => {
    const { model } = await createSpreadsheetWithChart();
    const sheetId = model.getters.getActiveSheetId();
    const chartId = model.getters.getChartIds(sheetId)[0];
    expect(model.getters.getChartDataSource(chartId)).not.toBe(undefined);
});

test("Odoo bar chart runtime loads the data", async () => {
    const { model } = await createSpreadsheetWithChart({
        type: "odoo_bar",
        mockRPC: async function (route, args) {
            if (args.method === "web_read_group") {
                expect.step("web_read_group");
            }
        },
    });
    const sheetId = model.getters.getActiveSheetId();
    const chartId = model.getters.getChartIds(sheetId)[0];
    expect([]).toVerifySteps({ message: "it should not be loaded eagerly" });
    expect(model.getters.getChartRuntime(chartId).chartJsConfig.data).toEqual({
        datasets: [],
        labels: [],
    });
    await animationFrame();
    expect(model.getters.getChartRuntime(chartId).chartJsConfig.data).toEqual({
        datasets: [
            {
                backgroundColor: "rgb(31,119,180)",
                borderColor: "rgb(31,119,180)",
                data: [1, 3],
                label: "Count",
            },
        ],
        labels: ["false", "true"],
    });
    expect(["web_read_group"]).toVerifySteps({ message: "it should have loaded the data" });
});

test("Odoo pie chart runtime loads the data", async () => {
    const { model } = await createSpreadsheetWithChart({
        type: "odoo_pie",
        mockRPC: async function (route, args) {
            if (args.method === "web_read_group") {
                expect.step("web_read_group");
            }
        },
    });
    const sheetId = model.getters.getActiveSheetId();
    const chartId = model.getters.getChartIds(sheetId)[0];
    expect([]).toVerifySteps({ message: "it should not be loaded eagerly" });
    expect(model.getters.getChartRuntime(chartId).chartJsConfig.data).toEqual({
        datasets: [],
        labels: [],
    });
    await animationFrame();
    expect(model.getters.getChartRuntime(chartId).chartJsConfig.data).toEqual({
        datasets: [
            {
                backgroundColor: ["rgb(31,119,180)", "rgb(255,127,14)", "rgb(174,199,232)"],
                borderColor: "#FFFFFF",
                data: [1, 3],
                label: "",
            },
        ],
        labels: ["false", "true"],
    });
    expect(["web_read_group"]).toVerifySteps({ message: "it should have loaded the data" });
});

test("Odoo line chart runtime loads the data", async () => {
    const { model } = await createSpreadsheetWithChart({
        type: "odoo_line",
        mockRPC: async function (route, args) {
            if (args.method === "web_read_group") {
                expect.step("web_read_group");
            }
        },
    });
    const sheetId = model.getters.getActiveSheetId();
    const chartId = model.getters.getChartIds(sheetId)[0];
    expect([]).toVerifySteps({ message: "it should not be loaded eagerly" });
    expect(model.getters.getChartRuntime(chartId).chartJsConfig.data).toEqual({
        datasets: [],
        labels: [],
    });
    await animationFrame();
    expect(model.getters.getChartRuntime(chartId).chartJsConfig.data).toEqual({
        datasets: [
            {
                backgroundColor: "#1F77B466",
                borderColor: "rgb(31,119,180)",
                data: [1, 3],
                label: "Count",
                lineTension: 0,
                fill: "origin",
                pointBackgroundColor: "rgb(31,119,180)",
            },
        ],
        labels: ["false", "true"],
    });
    expect(["web_read_group"]).toVerifySteps({ message: "it should have loaded the data" });
});

test("Data reloaded strictly upon domain update", async () => {
    const { model } = await createSpreadsheetWithChart({
        type: "odoo_line",
        mockRPC: async function (route, args) {
            if (args.method === "web_read_group") {
                expect.step("web_read_group");
            }
        },
    });
    const sheetId = model.getters.getActiveSheetId();
    const chartId = model.getters.getChartIds(sheetId)[0];
    const definition = model.getters.getChartDefinition(chartId);

    // force runtime computation
    model.getters.getChartRuntime(chartId);
    await animationFrame();
    expect(["web_read_group"]).toVerifySteps({ message: "it should have loaded the data" });

    model.dispatch("UPDATE_CHART", {
        definition: {
            ...definition,
            searchParams: { ...definition.searchParams, domain: [["1", "=", "1"]] },
        },
        id: chartId,
        sheetId,
    });
    // force runtime computation
    model.getters.getChartRuntime(chartId);
    await animationFrame();
    expect(["web_read_group"]).toVerifySteps({
        message: "it should have loaded the data with a new domain",
    });

    const newDefinition = model.getters.getChartDefinition(chartId);
    model.dispatch("UPDATE_CHART", {
        definition: {
            ...newDefinition,
            type: "odoo_bar",
        },
        id: chartId,
        sheetId,
    });
    // force runtime computation
    model.getters.getChartRuntime(chartId);
    await animationFrame();
    expect([]).toVerifySteps({
        message: "it should have not have loaded the data since the domain was unchanged",
    });
});

test("Can import/export an Odoo chart", async () => {
    const model = await createModelWithDataSource();
    insertChartInSpreadsheet(model, "odoo_line");
    const data = model.exportData();
    const figures = data.sheets[0].figures;
    expect(figures.length).toBe(1);
    const figure = figures[0];
    expect(figure.tag).toBe("chart");
    expect(figure.data.type).toBe("odoo_line");
    const m1 = await createModelWithDataSource({ spreadsheetData: data });
    const sheetId = m1.getters.getActiveSheetId();
    expect(m1.getters.getChartIds(sheetId).length).toBe(1);
    const chartId = m1.getters.getChartIds(sheetId)[0];
    expect(model.getters.getChartDataSource(chartId)).not.toBe(undefined);
    expect(m1.getters.getChartRuntime(chartId).chartJsConfig.type).toBe("line");
});

test("can import (export) contextual domain", async function () {
    const chartId = "1";
    const uid = user.userId;
    const spreadsheetData = {
        sheets: [
            {
                figures: [
                    {
                        id: chartId,
                        x: 10,
                        y: 10,
                        width: 536,
                        height: 335,
                        tag: "chart",
                        data: {
                            type: "odoo_line",
                            title: { text: "Partners" },
                            legendPosition: "top",
                            searchParams: {
                                domain: '[("foo", "=", uid)]',
                                groupBy: [],
                                orderBy: [],
                            },
                            metaData: {
                                groupBy: ["foo"],
                                measure: "__count",
                                resModel: "partner",
                            },
                        },
                    },
                ],
            },
        ],
    };
    const model = await createModelWithDataSource({
        spreadsheetData,
        mockRPC: function (route, args) {
            if (args.method === "web_read_group") {
                expect(args.kwargs.domain).toEqual([["foo", "=", uid]]);
                expect.step("web_read_group");
            }
        },
    });
    model.getters.getChartRuntime(chartId).chartJsConfig.data; // force loading the chart data
    await animationFrame();
    expect(model.exportData().sheets[0].figures[0].data.searchParams.domain).toBe(
        '[("foo", "=", uid)]',
        { message: "the domain is exported with the dynamic parts" }
    );
    expect(["web_read_group"]).toVerifySteps();
});

test("Can undo/redo an Odoo chart creation", async () => {
    const model = await createModelWithDataSource();
    insertChartInSpreadsheet(model, "odoo_line");
    const sheetId = model.getters.getActiveSheetId();
    const chartId = model.getters.getChartIds(sheetId)[0];
    expect(model.getters.getChartDataSource(chartId)).not.toBe(undefined);
    model.dispatch("REQUEST_UNDO");
    expect(model.getters.getChartIds(sheetId).length).toBe(0);
    model.dispatch("REQUEST_REDO");
    expect(model.getters.getChartDataSource(chartId)).not.toBe(undefined);
    expect(model.getters.getChartIds(sheetId).length).toBe(1);
});

test("charts with no legend", async () => {
    const { model } = await createSpreadsheetWithChart({ type: "odoo_pie" });
    insertChartInSpreadsheet(model, "odoo_bar");
    insertChartInSpreadsheet(model, "odoo_line");
    const sheetId = model.getters.getActiveSheetId();
    const [pieChartId, barChartId, lineChartId] = model.getters.getChartIds(sheetId);
    const pie = model.getters.getChartDefinition(pieChartId);
    const bar = model.getters.getChartDefinition(barChartId);
    const line = model.getters.getChartDefinition(lineChartId);
    expect(
        model.getters.getChartRuntime(pieChartId).chartJsConfig.options.plugins.legend.display
    ).toBe(true);
    expect(
        model.getters.getChartRuntime(barChartId).chartJsConfig.options.plugins.legend.display
    ).toBe(true);
    expect(
        model.getters.getChartRuntime(lineChartId).chartJsConfig.options.plugins.legend.display
    ).toBe(true);
    model.dispatch("UPDATE_CHART", {
        definition: {
            ...pie,
            legendPosition: "none",
        },
        id: pieChartId,
        sheetId,
    });
    model.dispatch("UPDATE_CHART", {
        definition: {
            ...bar,
            legendPosition: "none",
        },
        id: barChartId,
        sheetId,
    });
    model.dispatch("UPDATE_CHART", {
        definition: {
            ...line,
            legendPosition: "none",
        },
        id: lineChartId,
        sheetId,
    });
    expect(
        model.getters.getChartRuntime(pieChartId).chartJsConfig.options.plugins.legend.display
    ).toBe(false);
    expect(
        model.getters.getChartRuntime(barChartId).chartJsConfig.options.plugins.legend.display
    ).toBe(false);
    expect(
        model.getters.getChartRuntime(lineChartId).chartJsConfig.options.plugins.legend.display
    ).toBe(false);
});

test("Bar chart with stacked attribute is supported", async () => {
    const { model } = await createSpreadsheetWithChart({ type: "odoo_bar" });
    const sheetId = model.getters.getActiveSheetId();
    const chartId = model.getters.getChartIds(sheetId)[0];
    const definition = model.getters.getChartDefinition(chartId);
    model.dispatch("UPDATE_CHART", {
        definition: {
            ...definition,
            stacked: true,
        },
        id: chartId,
        sheetId,
    });
    expect(model.getters.getChartRuntime(chartId).chartJsConfig.options.scales.x.stacked).toBe(
        true
    );
    expect(model.getters.getChartRuntime(chartId).chartJsConfig.options.scales.y.stacked).toBe(
        true
    );
    model.dispatch("UPDATE_CHART", {
        definition: {
            ...definition,
            stacked: false,
        },
        id: chartId,
        sheetId,
    });
    expect(model.getters.getChartRuntime(chartId).chartJsConfig.options.scales.x.stacked).toBe(
        undefined
    );
    expect(model.getters.getChartRuntime(chartId).chartJsConfig.options.scales.y.stacked).toBe(
        undefined
    );
});

test("Can copy/paste Odoo chart", async () => {
    const { model } = await createSpreadsheetWithChart({ type: "odoo_pie" });
    const sheetId = model.getters.getActiveSheetId();
    const chartId = model.getters.getChartIds(sheetId)[0];
    model.dispatch("SELECT_FIGURE", { id: chartId });
    model.dispatch("COPY");
    model.dispatch("PASTE", { target: [toZone("A1")] });
    const chartIds = model.getters.getChartIds(sheetId);
    expect(chartIds.length).toBe(2);
    expect(model.getters.getChart(chartIds[1]) instanceof OdooChart).toBe(true);
    expect(JSON.stringify(model.getters.getChartRuntime(chartIds[1]))).toBe(
        JSON.stringify(model.getters.getChartRuntime(chartId))
    );

    expect(model.getters.getChart(chartId).dataSource).not.toBe(
        model.getters.getChart(chartIds[1]).dataSource,
        { message: "The datasource is also duplicated" }
    );
});

test("Can cut/paste Odoo chart", async () => {
    const { model } = await createSpreadsheetWithChart({ type: "odoo_pie" });
    const sheetId = model.getters.getActiveSheetId();
    const chartId = model.getters.getChartIds(sheetId)[0];
    const chartRuntime = model.getters.getChartRuntime(chartId);
    model.dispatch("SELECT_FIGURE", { id: chartId });
    model.dispatch("CUT");
    model.dispatch("PASTE", { target: [toZone("A1")] });
    const chartIds = model.getters.getChartIds(sheetId);
    expect(chartIds.length).toBe(1);
    expect(chartIds[0]).not.toBe(chartId);
    expect(model.getters.getChart(chartIds[0]) instanceof OdooChart).toBe(true);
    expect(JSON.stringify(model.getters.getChartRuntime(chartIds[0]))).toBe(
        JSON.stringify(chartRuntime)
    );
});

test("Duplicating a sheet correctly duplicates Odoo chart", async () => {
    const { model } = await createSpreadsheetWithChart({ type: "odoo_bar" });
    const sheetId = model.getters.getActiveSheetId();
    const secondSheetId = "secondSheetId";
    const chartId = model.getters.getChartIds(sheetId)[0];
    model.dispatch("DUPLICATE_SHEET", { sheetId, sheetIdTo: secondSheetId });
    const chartIds = model.getters.getChartIds(secondSheetId);
    expect(chartIds.length).toBe(1);
    expect(model.getters.getChart(chartIds[0]) instanceof OdooChart).toBe(true);
    expect(JSON.stringify(model.getters.getChartRuntime(chartIds[0]))).toBe(
        JSON.stringify(model.getters.getChartRuntime(chartId))
    );

    expect(model.getters.getChart(chartId).dataSource).not.toBe(
        model.getters.getChart(chartIds[0]).dataSource,
        { message: "The datasource is also duplicated" }
    );
});

test("Line chart with stacked attribute is supported", async () => {
    const { model } = await createSpreadsheetWithChart({ type: "odoo_line" });
    const sheetId = model.getters.getActiveSheetId();
    const chartId = model.getters.getChartIds(sheetId)[0];
    const definition = model.getters.getChartDefinition(chartId);
    model.dispatch("UPDATE_CHART", {
        definition: {
            ...definition,
            stacked: true,
        },
        id: chartId,
        sheetId,
    });
    expect(model.getters.getChartRuntime(chartId).chartJsConfig.options.scales.x.stacked).toBe(
        undefined
    );
    expect(model.getters.getChartRuntime(chartId).chartJsConfig.options.scales.y.stacked).toBe(
        true
    );
    model.dispatch("UPDATE_CHART", {
        definition: {
            ...definition,
            stacked: false,
        },
        id: chartId,
        sheetId,
    });
    expect(model.getters.getChartRuntime(chartId).chartJsConfig.options.scales.x.stacked).toBe(
        undefined
    );
    expect(model.getters.getChartRuntime(chartId).chartJsConfig.options.scales.y.stacked).toBe(
        undefined
    );
});

test("Load odoo chart spreadsheet with models that cannot be accessed", async function () {
    let hasAccessRights = true;
    const { model } = await createSpreadsheetWithChart({
        mockRPC: async function (route, args) {
            if (args.model === "partner" && args.method === "web_read_group" && !hasAccessRights) {
                throw makeServerError({ description: "ya done!" });
            }
        },
    });
    const chartId = model.getters.getFigures(model.getters.getActiveSheetId())[0].id;
    const chartDataSource = model.getters.getChartDataSource(chartId);
    await waitForDataLoaded(model);
    const data = chartDataSource.getData();
    expect(data.datasets.length).toBe(1);
    expect(data.labels.length).toBe(2);

    hasAccessRights = false;
    chartDataSource.load({ reload: true });
    await waitForDataLoaded(model);
    expect(chartDataSource.getData()).toEqual({ datasets: [], labels: [] });
});

test("Line chart to support cumulative data", async () => {
    const { model } = await createSpreadsheetWithChart({ type: "odoo_line" });
    const sheetId = model.getters.getActiveSheetId();
    const chartId = model.getters.getChartIds(sheetId)[0];
    const definition = model.getters.getChartDefinition(chartId);
    await waitForDataLoaded(model);
    expect(model.getters.getChartRuntime(chartId).chartJsConfig.data.datasets[0].data).toEqual([
        1, 3,
    ]);
    model.dispatch("UPDATE_CHART", {
        definition: {
            ...definition,
            cumulative: true,
        },
        id: chartId,
        sheetId,
    });
    expect(model.getters.getChartRuntime(chartId).chartJsConfig.data.datasets[0].data).toEqual([
        1, 4,
    ]);
    model.dispatch("UPDATE_CHART", {
        definition: {
            ...definition,
            cumulative: false,
        },
        id: chartId,
        sheetId,
    });
    expect(model.getters.getChartRuntime(chartId).chartJsConfig.data.datasets[0].data).toEqual([
        1, 3,
    ]);
});

test("cumulative line chart with past data before domain period", async () => {
    const serverData = getBasicServerData();
    serverData.models.partner.records = [
        { date: "2020-01-01", probability: 10 },
        { date: "2021-01-01", probability: 2 },
        { date: "2022-01-01", probability: 3 },
        { date: "2022-03-01", probability: 4 },
        { date: "2022-06-01", probability: 5 },
    ];
    const { model } = await createSpreadsheetWithChart({
        type: "odoo_line",
        serverData,
        definition: {
            type: "odoo_line",
            metaData: {
                groupBy: ["date"],
                measure: "probability",
                order: null,
                resModel: "partner",
            },
            searchParams: {
                comparison: null,
                context: {},
                domain: [
                    ["date", ">=", "2022-01-01"],
                    ["date", "<=", "2022-12-31"],
                ],
                groupBy: [],
                orderBy: [],
            },
            cumulative: true,
            title: { text: "Partners" },
            dataSourceId: "42",
            id: "42",
        },
    });
    const sheetId = model.getters.getActiveSheetId();
    const chartId = model.getters.getChartIds(sheetId)[0];
    await waitForDataLoaded(model);
    expect(model.getters.getChartRuntime(chartId).chartJsConfig.data.datasets[0].data).toEqual([
        15, 19, 24,
    ]);
});

test("Can insert odoo chart from a different model", async () => {
    const model = await createModelWithDataSource();
    insertListInSpreadsheet(model, { model: "product", columns: ["name"] });
    await addGlobalFilter(model, THIS_YEAR_GLOBAL_FILTER);
    const sheetId = model.getters.getActiveSheetId();
    expect(model.getters.getChartIds(sheetId).length).toBe(0);
    insertChartInSpreadsheet(model);
    expect(model.getters.getChartIds(sheetId).length).toBe(1);
});

test("Remove odoo chart when sheet is deleted", async () => {
    const { model } = await createSpreadsheetWithChart({ type: "odoo_line" });
    const sheetId = model.getters.getActiveSheetId();
    model.dispatch("CREATE_SHEET", {
        sheetId: model.uuidGenerator.uuidv4(),
        position: model.getters.getSheetIds().length,
    });
    expect(model.getters.getOdooChartIds().length).toBe(1);
    model.dispatch("DELETE_SHEET", { sheetId });
    expect(model.getters.getOdooChartIds().length).toBe(0);
});
