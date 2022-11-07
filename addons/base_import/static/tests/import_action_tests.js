/** @odoo-module */

import { browser } from "@web/core/browser/browser";
import {
    click,
    editInput,
    editSelect,
    editSelectMenu,
    getFixture,
    nextTick,
    patchWithCleanup,
} from "@web/../tests/helpers/utils";
import { createWebClient, doAction } from "@web/../tests/webclient/helpers";
import { registry } from "@web/core/registry";
import { makeFakeNotificationService } from "@web/../tests/helpers/mock_services";
import { ImportDataProgress } from "../src/import_data_progress/import_data_progress";
import { ImportAction } from "../src/import_action/import_action";
import { BlockUI } from "@web/core/ui/block_ui";
import { useEffect } from "@odoo/owl";

const serviceRegistry = registry.category("services");

function registerFakeHTTPService(validate = (route, params) => {}) {
    const fakeHTTPService = {
        start() {
            return {
                post: (route, params) => {
                    validate(route, params);
                    const file = {
                        id: 10,
                        name: params.ufile[0].name,
                        mimetype: "text/plain",
                    };
                    return JSON.stringify([file]);
                },
            };
        },
    };
    serviceRegistry.add("http", fakeHTTPService);
}

QUnit.module("Base Import Tests", (hooks) => {
    let serverData,
        target,
        getFieldsTree,
        getMatches,
        parsePreview,
        executeImport,
        executeFailingImport,
        totalRows;

    hooks.beforeEach(async () => {
        target = getFixture();
        serverData = {
            actions: {
                1: {
                    name: "Import Data",
                    tag: "import",
                    target: "current",
                    type: "ir.actions.client",
                    params: {
                        model: "partner",
                    },
                },
            },
            models: {
                partner: {
                    fields: {
                        display_name: { string: "Display name", type: "char" },
                        foo: { string: "Foo", type: "char" },
                        bar: { string: "Bar", type: "boolean", model_name: "partner" },
                        selection: {
                            string: "Selection",
                            type: "selection",
                            selection: [
                                ["item_1", "First Item"],
                                ["item_2", "Second item"],
                            ],
                            model_name: "partner",
                        },
                        many2many_field: {
                            string: "Many2Many",
                            type: "many2many",
                            relation: "partner",
                            comodel_name: "comodel.test",
                        },
                    },
                    records: [],
                },
            },
        };

        getFieldsTree = () => {
            const fields = Object.entries(serverData.models.partner.fields);
            fields.forEach(([k, v]) => {
                v.id = k;
                v.fields = [];
            });
            const mappedFields = fields.map((e) => e[1]);
            return mappedFields.filter(
                (e) => ["id", "__last_update", "name"].includes(e.id) === false
            );
        };

        getMatches = (headers) => {
            // basic implementation for testing purposes which matches if the first line is the
            // name of a field, or corresponds to the string value of a field from serverData
            const matches = [];
            for (const header of headers) {
                if (serverData.models.partner.fields[header]) {
                    matches.push([header]);
                }
                const serverDataIndex = Object.values(serverData.models.partner.fields).findIndex(
                    (e) => e.string === header
                );
                if (serverDataIndex !== -1) {
                    matches.push([Object.keys(serverData.models.partner.fields)[serverDataIndex]]);
                }
            }
            return Object.assign({}, matches);
        };

        parsePreview = (opts) => {
            const fakePreviewData = [
                ["Foo", "Deco addict", "Azure Interior", "Brandon Freeman"],
                ["Bar", "1", "1", "0"],
                ["Display name", "Azure Interior"],
            ];
            const headers = opts.has_headers && fakePreviewData.map((col) => col[0]);
            totalRows = [...fakePreviewData].sort((a, b) => (a.length > b.length ? -1 : 1))[0]
                .length;
            return Promise.resolve({
                advanced_mode: opts.advanced,
                batch: false,
                fields: getFieldsTree(),
                file_length: opts.has_headers ? totalRows - 1 : totalRows,
                header_types: false,
                headers: headers,
                matches: opts.has_headers && getMatches(headers),
                options: {
                    ...opts,
                    sheet: opts.sheet.length ? opts.sheet : "Template",
                    sheets: ["Template", "Template 2"],
                },
                preview: opts.has_headers
                    ? fakePreviewData.map((col) => col.shift() && col)
                    : [...fakePreviewData],
            });
        };

        executeImport = async (data, shouldWait = false) => {
            const res = {
                ids: [],
            };
            const matching = data[1].filter((f) => f !== false);
            if (matching.length) {
                res.ids.push(1);
            } else {
                res.messages = [
                    {
                        type: "error",
                        not_matching_error: true,
                        message: "You must configure at least one field to import",
                    },
                ];
            }
            if (data[3].skip + 1 < (data[3].has_headers ? totalRows - 1 : totalRows)) {
                res.nextrow = data[3].skip + data[3].limit;
            }
            if (shouldWait) {
                // make sure the progress bar is shown
                await nextTick();
            }
            return res;
        };

        // since executing a real import would be difficult, this method simply returns
        // some error messages to help testing the UI
        executeFailingImport = (field, isMultiline) => {
            let moreInfo = [];
            if (serverData.models.partner.fields[field].type === "selection") {
                moreInfo = serverData.models.partner.fields[field].selection;
            }
            return {
                ids: false,
                messages: isMultiline
                    ? [
                          {
                              field,
                              field_name: serverData.models.partner.fields[field].string,
                              field_path: "",
                              message: "Invalid value",
                              moreInfo,
                              record: 0,
                              rows: { from: 0, to: 0 },
                              value: "Invalid value",
                              priority: "info",
                          },
                          {
                              field,
                              field_name: serverData.models.partner.fields[field].string,
                              field_path: "",
                              message: "Duplicate value",
                              moreInfo,
                              record: 0,
                              rows: { from: 1, to: 1 },
                              priority: "error",
                          },
                          {
                              field,
                              field_name: serverData.models.partner.fields[field].string,
                              field_path: "",
                              message: "Wrong values",
                              moreInfo,
                              record: 0,
                              rows: { from: 2, to: 3 },
                              priority: "warning",
                          },
                          {
                              field,
                              field_name: serverData.models.partner.fields[field].string,
                              field_path: "",
                              message: "Bad value here",
                              moreInfo,
                              record: 0,
                              rows: { from: 4, to: 4 },
                              value: "Bad value",
                              priority: "warning",
                          },
                          {
                              field,
                              field_name: serverData.models.partner.fields[field].string,
                              field_path: "",
                              message: "Duplicate value",
                              moreInfo,
                              record: 0,
                              rows: { from: 5, to: 5 },
                              priority: "error",
                          },
                      ]
                    : [
                          {
                              field,
                              field_name: serverData.models.partner.fields[field].string,
                              field_path: "",
                              message: "Incorrect value",
                              moreInfo,
                              record: 0,
                              rows: { from: 0, to: 0 },
                          },
                      ],
                name: ["Some invalid content", "Wrong content", "Bad content"],
                nextrow: 0,
            };
        };

        target = getFixture();
    });

    async function startWebClient(customRouter = {}) {
        const router = {
            "/web/dataset/call_kw/partner/get_import_templates": (route, args) =>
                Promise.resolve([]),
            "/web/dataset/call_kw/base_import.import/parse_preview": (route, args) =>
                parsePreview(args[1]),
            "/web/dataset/call_kw/base_import.import/execute_import": (route, args) =>
                executeImport(args),
            "/web/dataset/call_kw/base_import.import/create": (route, args) => Promise.resolve(11),
            "base_import.import/get_fields": (route, args) =>
                Promise.resolve(serverData.models.partner.fields),
        };

        for (const key in customRouter) {
            router["/web/dataset/call_kw/" + key] = customRouter[key];
        }

        const webClient = await createWebClient({
            serverData,
            mockRPC: function (route, { args }) {
                if (route in router) {
                    return router[route](route.replace("/web/dataset/call_kw/", ""), args);
                }
            },
        });

        await doAction(webClient, 1);
    }

    QUnit.module("ImportAction");

    QUnit.test("Import view: UI before file upload", async function (assert) {
        const templateURL = "/myTemplateURL.xlsx";

        await startWebClient({
            "partner/get_import_templates": (route, args) => {
                assert.step(route);
                return Promise.resolve([
                    {
                        label: "Some Import Template",
                        template: templateURL,
                    },
                ]);
            },
            "base_import.import/create": (route, args) => {
                assert.step(route);
                return Promise.resolve(11);
            },
        });

        assert.containsOnce(target, ".o_import_action", "import view is displayed");
        assert.strictEqual(
            target.querySelector(".o_nocontent_help .btn-outline-primary").textContent,
            " Some Import Template"
        );
        assert.strictEqual(
            target.querySelector(".o_nocontent_help .btn-outline-primary").href,
            window.location.origin + templateURL,
            "button has the right download url"
        );
        assert.verifySteps(["partner/get_import_templates", "base_import.import/create"]);
        assert.containsN(
            target,
            ".o_cp_buttons button",
            2,
            "only two buttons are visible by default"
        );
    });

    QUnit.test("Import view: import a file with multiple sheets", async function (assert) {
        registerFakeHTTPService((route, params) => {
            assert.strictEqual(route, "/base_import/set_file");
            assert.strictEqual(
                params.ufile[0].name,
                "fake_file.xlsx",
                "file is correctly uploaded to the server"
            );
        });

        patchWithCleanup(browser, {
            setTimeout: (fn) => fn(),
        });

        await startWebClient({
            "partner/get_import_templates": (route, args) => {
                assert.step(route);
                return Promise.resolve([]);
            },
            "base_import.import/parse_preview": (route, args) => {
                assert.step(route);
                return parsePreview(args[1]);
            },
            "base_import.import/create": (route, args) => {
                assert.step(route);
                return Promise.resolve(11);
            },
        });

        // Set and trigger the change of a file for the input
        const file = new File(["fake_file"], "fake_file.xlsx", { type: "text/plain" });
        await editInput(target, "input[type='file']", file);
        assert.verifySteps([
            "partner/get_import_templates",
            "base_import.import/create",
            "base_import.import/parse_preview",
        ]);
        assert.containsOnce(
            target,
            ".o_import_action .o_import_data_sidepanel",
            "side panel is visible"
        );
        assert.containsOnce(
            target,
            ".o_import_action .o_import_data_content",
            "content panel is visible"
        );
        assert.strictEqual(
            target.querySelector(".o_import_data_sidepanel .fst-italic.truncate").textContent,
            "fake_file",
            "filename is shown and can be truncated"
        );
        assert.strictEqual(
            target.querySelector(".o_import_data_sidepanel .fst-italic:not(.truncate)").textContent,
            ".xlsx",
            "file extension is displayed on its own"
        );
        assert.strictEqual(
            target.querySelector(".o_import_data_sidepanel [name=o_import_sheet]")
                .selectedOptions[0].textContent,
            "Template",
            "first sheet is selected by default"
        );

        assert.containsN(
            target,
            ".o_import_data_content tbody > tr",
            3,
            "recognized values are displayed in the view"
        );
        assert.strictEqual(
            target.querySelector(".o_import_data_content tr:first-child td span:first-child")
                .textContent,
            "Foo",
            "column title is shown"
        );
        assert.strictEqual(
            target.querySelector(".o_import_data_content tr:first-child td span:nth-child(2)")
                .textContent,
            "Deco addict",
            "first example is shown"
        );
        assert.strictEqual(
            target.querySelector(".o_import_data_content tr:first-child td span:nth-child(2)")
                .dataset.tooltipInfo,
            '{"lines":["Deco addict","Azure Interior","Brandon Freeman"]}',
            "tooltip contains other examples"
        );
        assert.containsNone(
            target,
            ".o_import_data_content tbody td:nth-child(3) .alert-info",
            "no comments are shown"
        );

        // Select a field already selected for another column
        await editSelectMenu(target, ".o_import_data_content .o_select_menu", "Display name");
        assert.containsN(
            target,
            ".o_import_data_content tbody td:nth-child(3) .alert-info",
            2,
            "two comments are shown"
        );
        assert.strictEqual(
            target.querySelector(".o_import_data_content tbody td:nth-child(3) .alert-info")
                .textContent,
            "This column will be concatenated in field Display name."
        );

        // Preview the second sheet
        await editSelect(target, ".o_import_data_sidepanel [name=o_import_sheet]", "Template 2");
        assert.verifySteps(
            ["base_import.import/parse_preview"],
            "changing sheet has sent a new parse_preview request"
        );
        assert.strictEqual(
            target.querySelector(".o_import_data_sidepanel [name=o_import_sheet]")
                .selectedOptions[0].textContent,
            "Template 2",
            "second sheet is now selected"
        );
        assert.containsNone(
            target,
            ".o_import_data_content tbody td:nth-child(3) .alert-info",
            "no comments are shown"
        );
    });

    QUnit.test("Import view: import a CSV file with one sheet", async function (assert) {
        registerFakeHTTPService((route, params) => {
            assert.strictEqual(route, "/base_import/set_file");
            assert.strictEqual(
                params.ufile[0].name,
                "fake_file.csv",
                "file is correctly uploaded to the server"
            );
        });
        await startWebClient();

        // Set and trigger the change of a file for the input
        const file = new File(["fake_file"], "fake_file.csv", { type: "text/plain" });
        await editInput(target, "input[type='file']", file);
        assert.containsOnce(
            target,
            ".o_import_data_sidepanel .o_import_formatting",
            "formatting options are present in the side panel"
        );
        assert.containsOnce(
            target,
            ".o_import_action .o_import_data_content",
            "content panel is visible"
        );
    });

    QUnit.test("Import view: additional options in debug", async function (assert) {
        patchWithCleanup(odoo, { debug: true });
        registerFakeHTTPService();

        await startWebClient({
            "base_import.import/parse_preview": (route, args) => {
                assert.strictEqual(
                    args[1].advanced,
                    true,
                    "in debug, advanced_mode is set in parse_preview"
                );
                return parsePreview(args[1]);
            },
        });

        // Set and trigger the change of a file for the input
        const file = new File(["fake_file"], "fake_file.csv", { type: "text/plain" });
        await editInput(target, "input[type='file']", file);

        await nextTick();
        assert.containsOnce(
            target,
            ".o_import_data_sidepanel .o_import_debug_options",
            "additional options are present in the side panel in debug mode"
        );
    });

    QUnit.test(
        "Import view: execute import with option 'use first row as headers'",
        async function (assert) {
            registerFakeHTTPService();
            const notificationMock = (message) => {
                assert.step(message);
                return () => {};
            };
            registry
                .category("services")
                .add("notification", makeFakeNotificationService(notificationMock), {
                    force: true,
                });

            patchWithCleanup(browser, {
                setTimeout: (fn) => fn(),
            });

            await startWebClient({
                "base_import.import/parse_preview": async (route, args) => {
                    assert.step(route);
                    return parsePreview(args[1]);
                },
                "base_import.import/execute_import": (route, args) => {
                    assert.step(route);
                    return executeImport(args);
                },
            });

            // Set and trigger the change of a file for the input
            const file = new File(["fake_file"], "fake_file.xls", { type: "text/plain" });
            await editInput(target, "input[type='file']", file);
            assert.strictEqual(
                target.querySelector(".o_import_data_sidepanel input[type=checkbox]").checked,
                true,
                "by default, the checkbox is enabled"
            );
            assert.verifySteps(["base_import.import/parse_preview"]);
            assert.strictEqual(
                target.querySelector(".o_import_data_content tr:first-child td span:first-child")
                    .textContent,
                "Foo",
                "first row is used as column title"
            );
            assert.strictEqual(
                target.querySelector(".o_import_data_content .o_select_menu").textContent,
                "Foo",
                "as the column header could match with a database field, it is selected by default"
            );

            await click(target.querySelector(".o_import_data_sidepanel input[type=checkbox]"));
            assert.verifySteps(["base_import.import/parse_preview"]);
            assert.strictEqual(
                target.querySelector(".o_import_data_content tr:first-child td span:first-child")
                    .textContent,
                "Foo, Deco addict, Azure Interior, Brandon Freeman",
                "column title is shown as a list of rows elements"
            );
            assert.strictEqual(
                target.querySelector(".o_import_data_content .o_select_menu").textContent,
                "To import, select a field...",
                "as the column couldn't match with the database, user must make a choice"
            );

            await click(target.querySelector(".o_cp_buttons button:first-child"));
            assert.containsNone(
                target,
                ".o_notification_body",
                "should not display a notification"
            );
            assert.verifySteps(["base_import.import/execute_import"]);
            assert.containsOnce(
                target,
                ".o_import_data_content .alert-info",
                "if no fields were selected to match, the import fails with a message"
            );
            assert.containsOnce(
                target,
                ".o_import_data_content .alert-danger",
                "an error is also displayed"
            );
            assert.strictEqual(
                target.querySelector(".o_import_data_content .alert-danger").textContent,
                "You must configure at least one field to import"
            );

            await editSelectMenu(target, ".o_import_data_content .o_select_menu", "Display name");
            await click(target.querySelector(".o_cp_buttons button:first-child"));
            assert.verifySteps([
                "base_import.import/execute_import",
                "1 records successfully imported",
            ]);
        }
    );

    QUnit.test("Import view: import data that don't match (selection)", async function (assert) {
        serverData.models.partner.fields.selection.required = true;
        let shouldFail = true;

        registerFakeHTTPService();
        patchWithCleanup(browser, {
            setTimeout: (fn) => fn(),
        });

        await startWebClient({
            "base_import.import/execute_import": (route, args) => {
                if (shouldFail) {
                    shouldFail = false;
                    return executeFailingImport(args[1][0]);
                }
                assert.deepEqual(
                    args[3].fallback_values,
                    {
                        selection: {
                            fallback_value: "item_2",
                            field_model: "partner",
                            field_type: "selection",
                        },
                    },
                    "selected fallback value has been given to the request"
                );
                return executeImport(args);
            },
        });

        // Set and trigger the change of a file for the input
        const file = new File(["fake_file"], "fake_file.xlsx", { type: "text/plain" });
        await editInput(target, "input[type='file']", file);
        // For this test, we force the display of an error message if this field is set
        await editSelectMenu(target, ".o_import_data_content .o_select_menu", "Selection");
        await click(target.querySelector(".o_cp_buttons button:nth-child(2)"));
        assert.strictEqual(
            target.querySelector(".o_import_data_content .alert-danger").textContent,
            "The file contains blocking errors (see below)",
            "a message is shown if the import was blocked"
        );
        assert.strictEqual(
            target.querySelector(".o_import_report p").textContent,
            "Incorrect value",
            "the message is displayed in the view"
        );
        assert.containsOnce(
            target,
            ".o_import_field_selection",
            "an action can be set when the column cannot match a field"
        );
        assert.strictEqual(
            target.querySelector(".o_import_field_selection select").textContent,
            "Prevent importSet to: First ItemSet to: Second item",
            "'skip' option is nopt available, since the field is required"
        );
        assert.strictEqual(
            target.querySelector(".o_import_field_selection select").selectedOptions[0].textContent,
            "Prevent import",
            "prevent option is selected by default"
        );
        editSelect(target, ".o_import_field_selection select", "item_2");
        await click(target.querySelector(".o_cp_buttons button:nth-child(2)"));
        assert.strictEqual(
            target.querySelector(".o_import_data_content .alert-info").textContent,
            "Everything seems valid.",
            "import is now successful"
        );
        assert.containsOnce(
            target,
            ".o_import_field_selection",
            "options are still present to change the action to do when the column don't match"
        );
    });

    QUnit.test("Import view: import data that don't match (boolean)", async function (assert) {
        let shouldFail = true;

        registerFakeHTTPService();
        patchWithCleanup(browser, {
            setTimeout: (fn) => fn(),
        });

        await startWebClient({
            "base_import.import/execute_import": (route, args) => {
                if (shouldFail) {
                    shouldFail = false;
                    // return executeFailingImport(args, args[1][0]);
                    return executeFailingImport(args[1][0]);
                }
                assert.deepEqual(
                    args[3].fallback_values,
                    {
                        bar: {
                            fallback_value: "false",
                            field_model: "partner",
                            field_type: "boolean",
                        },
                    },
                    "selected fallback value has been given to the request"
                );
                return executeImport(args);
            },
        });

        // Set and trigger the change of a file for the input
        const file = new File(["fake_file"], "fake_file.xlsx", { type: "text/plain" });
        await editInput(target, "input[type='file']", file);
        // For this test, we force the display of an error message if this field is set
        await editSelectMenu(target, ".o_import_data_content .o_select_menu", "Bar");
        await click(target.querySelector(".o_cp_buttons button:nth-child(2)"));
        assert.strictEqual(
            target.querySelector(".o_import_data_content .alert-danger").textContent,
            "The file contains blocking errors (see below)",
            "a message is shown if the import was blocked"
        );
        assert.strictEqual(
            target.querySelector(".o_import_field_boolean select").textContent,
            "Prevent importSet to: FalseSet to: TrueSkip record",
            "options are 'prevent', choose a default boolean value or 'skip'"
        );
        editSelect(target, ".o_import_field_boolean select", "false");
        await click(target.querySelector(".o_cp_buttons button:nth-child(2)"));
        assert.strictEqual(
            target.querySelector(".o_import_data_content .alert-info").textContent,
            "Everything seems valid.",
            "import is now successful"
        );
    });

    QUnit.test("Import view: import data that don't match (many2many)", async function (assert) {
        let executeCount = 0;

        registerFakeHTTPService();
        patchWithCleanup(browser, {
            setTimeout: (fn) => fn(),
        });

        await startWebClient({
            "base_import.import/execute_import": (route, args) => {
                executeCount++;
                if (executeCount === 1) {
                    return executeFailingImport(args[1][0]);
                }
                if (executeCount === 2) {
                    assert.deepEqual(
                        args[3].name_create_enabled_fields,
                        {
                            many2many_field: true,
                        },
                        "selected fallback value has been given to the request"
                    );
                } else {
                    assert.deepEqual(
                        args[3].name_create_enabled_fields,
                        {},
                        "selected fallback value has been given to the request"
                    );
                    assert.deepEqual(
                        args[3].import_skip_records,
                        ["many2many_field"],
                        "selected fallback value has been given to the request"
                    );
                }
                return executeImport(args);
            },
        });

        // Set and trigger the change of a file for the input
        const file = new File(["fake_file"], "fake_file.xlsx", { type: "text/plain" });
        await editInput(target, "input[type='file']", file);
        // For this test, we force the display of an error message if this field is set
        await editSelectMenu(target, ".o_import_data_content .o_select_menu", "Many2Many");
        await click(target.querySelector(".o_cp_buttons button:nth-child(2)"));
        assert.strictEqual(
            target.querySelector(".o_import_data_content .alert-danger").textContent,
            "The file contains blocking errors (see below)",
            "a message is shown if the import was blocked"
        );
        assert.strictEqual(
            target.querySelector(".o_import_field_many2many select").textContent,
            "Prevent importSet value as emptySkip recordCreate new values",
            "options are 'prevent', choose a default boolean value or 'skip'"
        );
        editSelect(target, ".o_import_field_many2many select", "name_create_enabled_fields");
        await click(target.querySelector(".o_cp_buttons button:nth-child(2)"));
        assert.strictEqual(
            target.querySelector(".o_import_data_content .alert-info").textContent,
            "Everything seems valid.",
            "import is now successful"
        );
        editSelect(target, ".o_import_field_many2many select", "import_skip_records");
        await click(target.querySelector(".o_cp_buttons button:nth-child(2)"));
        assert.strictEqual(
            target.querySelector(".o_import_data_content .alert-info").textContent,
            "Everything seems valid.",
            "import is still successful"
        );
    });

    QUnit.test("Import view: import messages are grouped and sorted", async function (assert) {
        const fakeHTTPService = {
            start() {
                return {
                    post: (route, params) => {
                        const file = {
                            id: 10,
                            name: params.ufile[0].name,
                            mimetype: "text/plain",
                        };
                        return JSON.stringify([file]);
                    },
                };
            },
        };
        serviceRegistry.add("http", fakeHTTPService);

        patchWithCleanup(browser, {
            setTimeout: (fn) => fn(),
        });

        const webClient = await createWebClient({
            serverData,
            mockRPC: function (route, { args }) {
                if (route === "/web/dataset/call_kw/partner/get_import_templates") {
                    return Promise.resolve([]);
                }
                if (route === "/web/dataset/call_kw/base_import.import/parse_preview") {
                    return parsePreview(args[1]);
                }
                if (route === "/web/dataset/call_kw/base_import.import/get_fields") {
                    assert.step(route);
                    return Promise.resolve(serverData.models.partner.fields);
                }
                if (route === "/web/dataset/call_kw/base_import.import/execute_import") {
                    return executeFailingImport(args[1][0], true);
                }
                if (route === "/web/dataset/call_kw/base_import.import/create") {
                    return Promise.resolve(11);
                }
            },
        });

        await doAction(webClient, 1);

        // Set and trigger the change of a file for the input
        const file = new File(["fake_file"], "fake_file.xlsx", { type: "text/plain" });
        await editInput(target, "input[type='file']", file);
        await click(target.querySelector(".o_cp_buttons button:nth-child(1)"));
        assert.strictEqual(
            target.querySelector(".o_import_data_content .alert-danger").textContent,
            "The file contains blocking errors (see below)",
            "a message is shown if the import was blocked"
        );
        // Check that errors have been sorted and grouped
        assert.strictEqual(
            target.querySelector(".o_import_report p").textContent.trim(),
            "Multiple errors occurred  in field foo:"
        );
        assert.strictEqual(
            target.querySelector(".o_import_report li:first-child").textContent.trim(),
            "Duplicate value at multiple rows"
        );
        assert.strictEqual(
            target.querySelector(".o_import_report li:nth-child(2)").textContent.trim(),
            "Wrong values at multiple rows"
        );
        assert.strictEqual(
            target.querySelector(".o_import_report li:nth-child(3)").textContent.trim(),
            "Bad value at row 5"
        );
        assert.containsN(target, ".o_import_report li", 3, "only 3 errors are visible by default");
        assert.strictEqual(
            target.querySelector(".o_import_report_count").textContent.trim(),
            "1 more"
        );

        await click(target, ".o_import_report_count");
        assert.strictEqual(
            target.querySelector(".o_import_report_count + li").textContent.trim(),
            "Invalid value at row 1 (Some invalid content)"
        );
    });

    QUnit.test("Import view: test import in batches", async function (assert) {
        let executeImportCount = 0;
        registerFakeHTTPService();

        patchWithCleanup(ImportAction.prototype, {
            get isBatched() {
                // make sure the UI displays the batched import options
                return true;
            },
        });

        await startWebClient({
            "base_import.import/execute_import": (route, args) => {
                assert.deepEqual(
                    args[1],
                    ["foo", "bar", "display_name"],
                    "param contains the list of matching fields"
                );
                assert.deepEqual(
                    args[2],
                    ["foo", "bar", "display name"],
                    "param contains the list of associated columns"
                );
                assert.strictEqual(
                    args[3].limit,
                    1,
                    "limit option is equal to the value set in the view"
                );
                assert.strictEqual(
                    args[3].skip,
                    executeImportCount * args[3].limit,
                    "skip option increments at each import"
                );
                executeImportCount++;
                return executeImport(args);
            },
        });

        // Set and trigger the change of a file for the input
        const file = new File(["fake_file"], "fake_file.xls", { type: "text/plain" });
        await editInput(target, "input[type='file']", file);
        assert.strictEqual(
            target.querySelector("input#o_import_batch_limit").value,
            "2000",
            "by default, the batch limit is set to 2000 rows"
        );
        assert.strictEqual(
            target.querySelector("input#o_import_row_start").value,
            "1",
            "by default, the import starts at line 1"
        );

        await editInput(target, "input#o_import_batch_limit", 1);
        await click(target.querySelector(".o_cp_buttons button:nth-child(2)"));
        assert.strictEqual(
            target.querySelector(".o_import_data_content .alert-info").textContent,
            "Everything seems valid.",
            "a message is shown if the import test was successfull"
        );
        assert.strictEqual(executeImportCount, 3, "execute_import was called 3 times");
    });

    QUnit.test("Import view: execute and pause import in batches", async function (assert) {
        registerFakeHTTPService();

        patchWithCleanup(ImportAction.prototype, {
            get isBatched() {
                // make sure the UI displays the batched import options
                return true;
            },
        });

        patchWithCleanup(BlockUI.prototype, {
            block() {
                this._super();
                if (this.props.customMessage.text === "Importing") {
                    assert.step("Block UI received the right text");
                }
            },
        });

        patchWithCleanup(ImportDataProgress.prototype, {
            setup() {
                this._super();
                useEffect(
                    () => {
                        if (this.props.importProgress.step === 1) {
                            // Trigger a pause at this step to resume later from the view
                            assert.step("pause triggered during step 2");
                            this.interrupt();
                        }
                    },
                    () => [this.props.importProgress.step]
                );

                assert.strictEqual(
                    this.props.totalSteps,
                    3,
                    "progress bar receives the number of steps"
                );
                assert.deepEqual(
                    this.props.importProgress,
                    {
                        value: 0,
                        step: 1,
                    },
                    "progress status has been given to the progress bar"
                );
            },
        });

        await startWebClient({
            "base_import.import/execute_import": (route, args) => executeImport(args, true),
        });

        // Set and trigger the change of a file for the input
        const file = new File(["fake_file"], "fake_file.xls", { type: "text/plain" });
        await editInput(target, "input[type='file']", file);
        await editInput(target, "input#o_import_batch_limit", 1);
        await click(target.querySelector(".o_cp_buttons button:first-child"));
        await nextTick();
        await nextTick();
        assert.verifySteps(["Block UI received the right text", "pause triggered during step 2"]);
        assert.containsOnce(
            target,
            ".o_import_data_content div .alert-warning",
            "a message is shown to indicate the user to resume from the third row"
        );
        assert.strictEqual(
            target.querySelector(".o_import_data_content .alert-warning b:first-child").textContent,
            "Click 'Resume' to proceed with the import, resuming at line 2.",
            "a message is shown to indicate the user to resume from the third row"
        );
        assert.strictEqual(
            target.querySelector(".o_cp_buttons button:first-child").textContent,
            "Resume",
            "button contains the right text"
        );
        assert.strictEqual(
            target.querySelector("input#o_import_row_start").value,
            "2",
            "the import will resume at line 2"
        );
        assert.strictEqual(
            target.querySelector(".o_notification_body").textContent,
            "1 records successfully imported",
            "display a notification with the quantity of imported values"
        );
    });

    QUnit.test("Import view: test and pause import in batches", async function (assert) {
        registerFakeHTTPService();

        patchWithCleanup(ImportAction.prototype, {
            get isBatched() {
                // make sure the UI displays the batched import options
                return true;
            },
        });

        patchWithCleanup(BlockUI.prototype, {
            block() {
                this._super();
                if (this.props.customMessage.text === "Testing") {
                    assert.step("Block UI received the right text");
                }
            },
        });

        patchWithCleanup(ImportDataProgress.prototype, {
            setup() {
                this._super();
                useEffect(
                    () => {
                        if (this.props.importProgress.step === 1) {
                            // Trigger a pause at this step to resume later from the view
                            assert.step("pause triggered during step 2");
                            this.interrupt();
                        }
                    },
                    () => [this.props.importProgress.step]
                );

                assert.strictEqual(
                    this.props.totalSteps,
                    3,
                    "progress bar receives the number of steps"
                );
                assert.deepEqual(
                    this.props.importProgress,
                    {
                        value: 0,
                        step: 1,
                    },
                    "progress status has been given to the progress bar"
                );
            },
        });

        await startWebClient({
            "base_import.import/execute_import": (route, args) => executeImport(args, true),
        });

        // Set and trigger the change of a file for the input
        const file = new File(["fake_file"], "fake_file.xls", { type: "text/plain" });
        await editInput(target, "input[type='file']", file);
        await editInput(target, "input#o_import_batch_limit", 1);
        await click(target.querySelector(".o_cp_buttons button:nth-child(2)"));
        await nextTick();
        await nextTick();
        assert.verifySteps(["Block UI received the right text", "pause triggered during step 2"]);
        assert.strictEqual(
            target.querySelector(".o_import_data_content .alert-info").textContent,
            "Everything seems valid."
        );
        assert.strictEqual(
            target.querySelector(".o_cp_buttons button:first-child").textContent,
            "Import",
            "after testing, 'Resume' text is not shown"
        );
        assert.strictEqual(
            target.querySelector("input#o_import_row_start").value,
            "1",
            "the import will resume at line 1"
        );
    });
});
