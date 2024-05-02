/* global require */
"use strict";

const js = require("@eslint/js");
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");
const globals = require("globals");
const odooPlugin = require("preprocess/me");

module.exports = [
    js.configs.recommended,
    {
        languageOptions: {
            // When upgrading the ecmaVersion, make sure that the minimum
            // Node.js version defined in package.json is up-to-date enough to
            // support all features. This will avoid obscure syntax errors when
            // trying to set up ESLint when in fact it's simply the version of
            // Node.js that is outdated.
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.browser,
                $: "readonly",
                Alert: "readonly",
                chai: "readonly",
                Chart: "readonly",
                Collapse: "readonly",
                describe: "readonly",
                DOMPurify: "readonly",
                Dropdown: "readonly",
                FullCalendar: "readonly",
                fuzzy: "readonly",
                globalThis: "readonly",
                it: "readonly",
                jQuery: "readonly",
                luxon: "readonly",
                mocha: "readonly",
                Modal: "readonly",
                module: "readonly",
                odoo: "readonly",
                Offcanvas: "readonly",
                Popover: "readonly",
                py: "readonly",
                QUnit: "readonly",
                ScrollSpy: "readonly",
                StackTrace: "readonly",
                Tooltip: "readonly",
            },
        },
        plugins: {
            odoo: odooPlugin,
        },
        rules: {
            "odoo/static-gettext-argument": "error",
            "prettier/prettier": [
                "error",
                {
                    tabWidth: 4,
                    semi: true,
                    singleQuote: false,
                    printWidth: 100,
                    endOfLine: "auto",
                },
            ],
            "no-undef": "error",
            "no-restricted-globals": ["error", "event", "self"],
            "no-const-assign": ["error"],
            "no-debugger": ["error"],
            "no-dupe-class-members": ["error"],
            "no-dupe-keys": ["error"],
            "no-dupe-args": ["error"],
            "no-dupe-else-if": ["error"],
            "no-unsafe-negation": ["error"],
            "no-duplicate-imports": ["error"],
            "valid-typeof": ["error"],
            "no-unused-vars": [
                "error",
                {
                    vars: "all",
                    args: "none",
                    ignoreRestSiblings: false,
                    caughtErrors: "all",
                },
            ],
            curly: ["error", "all"],
            "no-restricted-syntax": ["error", "PrivateIdentifier"],
            "prefer-const": [
                "error",
                {
                    destructuring: "all",
                    ignoreReadBeforeAssign: true,
                },
            ],
        },
        ignores: [
            // Ignore everything by default: We don't want the formatter running
            // in the files of teams that are hostile to code formatting.
            "*",

            // Whitelist web and board
            "!addons",
            "addons/*",
            "!addons/web",
            "!addons/web/**/*",
            "!addons/board",
            "!addons/board/**/*",

            // Whitelist web_enterprise
            "!web_enterprise",
            "!web_enterprise/**/*",

            // Whitelist web_studio
            "!web_studio",
            "!web_studio/**/*",

            // Backlist web/ libs other than HOOT
            "addons/web/static/lib/**/*",
            "!addons/web/static/lib/hoot",
            "!addons/web/static/lib/hoot/**/*",

            // Ignore everything in web legacy but the top level (adapters)
            "addons/web/static/src/legacy/**/*",
            "!addons/web/static/src/legacy",
            "!addons/web/static/src/legacy/*.js",

            // Ignore everything in web_enterprise legacy but the top level (adapters)
            "web_enterprise/static/src/legacy/**/*",
            "!web_enterprise/static/src/legacy",
            "!web_enterprise/static/src/legacy/*.js",

            // Ignore everything in web_studio legacy but the top level (adapters)
            "web_studio/static/src/legacy/**/*",
            "!web_studio/static/src/legacy",
            "!web_studio/static/src/legacy/*.js",

            // Ignore all legacy related tests
            "addons/web/static/tests/**/legacy/*",
            "web_enterprise/static/tests/**/legacy/*",
            "web_studio/static/tests/**/legacy/*",

            // base_import
            // whitelist new code
            "!addons/base_import",
            "!addons/base_import/**/*",
            // blacklist legacy
            "addons/base_import/static/src/legacy/**/*",

            // web_cohort
            // whitelist new code
            "!web_cohort",
            "!web_cohort/**/*",

            // blacklist legacy
            "web_cohort/static/src/legacy/**/*",
            "web_cohort/static/tests/legacy/**/*",

            // web_gantt
            // whitelist new code
            "!web_gantt",
            "!web_gantt/**/*",

            // blacklist legacy
            "web_gantt/static/src/legacy/**/*",
            "web_gantt/static/tests/legacy/**/*",

            // planning
            // whitelist new code
            "!planning",
            "!planning/static",
            "!planning/static/src",
            "!planning/static/src/*.js",
            "!planning/static/tests",
            "!planning/static/tests/planning_gantt_tests.js",

            // project_enterprise
            // whitelist new code
            "!project_enterprise",
            "!project_enterprise/static",
            "!project_enterprise/static/src",
            "!project_enterprise/static/src/*.js",
            "!project_enterprise/static/tests",
            "!project_enterprise/static/tests/*.js",

            // web_map
            // whitelist new code
            "!web_map",
            "!web_map/**/*",

            // blacklist legacy
            "web_map/static/src/legacy/**/*",
            "web_map/static/tests/legacy/**/*",

            // whitelist web_tour
            "!web_tour",
            "!web_tour/**/*",

            // whitelist base_setup
            "!addons/base_setup",
            "!addons/base_setup/**/*",

            // whitelist purchase setup
            "!addons/purchase",
            "!addons/purchase/**/*",

            // Whitelist documents_spreadsheet
            "!documents_spreadsheet",
            "!documents_spreadsheet/**/*",

            // Whitelist spreadsheet
            "!addons/spreadsheet",
            "!addons/spreadsheet/**/*",

            // blacklist o-spreadsheet lib
            "addons/spreadsheet/static/src/o_spreadsheet/o_spreadsheet.js",

            // Whitelist spreadsheet_edition
            "!spreadsheet_edition",
            "!spreadsheet_edition/**/*",

            // Whitelist spreadsheet_account
            "!addons/spreadsheet_account",
            "!addons/spreadsheet_account/**/*",

            // Whitelist spreadsheet_dashboard
            "!addons/spreadsheet_dashboard",
            "!addons/spreadsheet_dashboard/**/*",

            // Whitelist spreadsheet_dashboard_account
            "!addons/spreadsheet_dashboard_account",
            "!addons/spreadsheet_dashboard_account/**/*",

            // Whitelist spreadsheet_dashboard_hr_expense
            "!addons/spreadsheet_dashboard_hr_expense",
            "!addons/spreadsheet_dashboard_hr_expense/**/*",

            // Whitelist spreadsheet_dashboard_pos_hr
            "!addons/spreadsheet_dashboard_pos_hr",
            "!addons/spreadsheet_dashboard_pos_hr/**/*",

            // Whitelist spreadsheet_dashboard_sale
            "!addons/spreadsheet_dashboard_sale",
            "!addons/spreadsheet_dashboard_sale/**/*",

            // Whitelist spreadsheet_dashboard_event_sale
            "!addons/spreadsheet_dashboard_event_sale",
            "!addons/spreadsheet_dashboard_event_sale/**/*",

            // Whitelist spreadsheet_dashboard_hr_contract
            "!spreadsheet_dashboard_hr_contract",
            "!spreadsheet_dashboard_hr_contract/**/*",

            // Whitelist spreadsheet_dashboard_crm
            "!spreadsheet_dashboard_crm",
            "!spreadsheet_dashboard_crm/**/*",

            // Whitelist spreadsheet_dashboard_edition
            "!spreadsheet_dashboard_edition",
            "!spreadsheet_dashboard_edition/**/*",

            // Whitelist spreadsheet_dashboard_documents
            "!spreadsheet_dashboard_documents",
            "!spreadsheet_dashboard_documents/**/*",

            // Whitelist bus
            "!addons/bus/",
            "!addons/bus/**/*",

            // Whitelist mail & dependents (with a lot of JS overrides)
            "!addons/calendar",
            "!addons/calendar/**/*",
            "!addons/hr",
            "!addons/hr/**/*",
            "!addons/hr_holidays",
            "!addons/hr_holidays/**/*",
            "!addons/im_livechat",
            "!addons/im_livechat/**/*",
            "!addons/mail",
            "!addons/mail/**/*",
            "!addons/snailmail",
            "!addons/snailmail/**/*",
            "!addons/test_discuss_full",
            "!addons/test_discuss_full/**/*",
            "!addons/website_livechat",
            "!addons/website_livechat/**/*",
            "!approvals",
            "!approvals/**/*",
            "!test_discuss_full_enterprise",
            "!test_discuss_full_enterprise/**/*",

            // Whitelist point_of_sale
            "!addons/point_of_sale",
            "!addons/point_of_sale/**/*",

            // Whitelist community pos modules
            "!addons/hw_posbox_homepage",
            "!addons/hw_posbox_homepage/**/*",
            "!addons/l10n_ar_pos",
            "!addons/l10n_ar_pos/**/*",
            "!addons/l10n_co_pos",
            "!addons/l10n_co_pos/**/*",
            "!addons/l10n_es_pos",
            "!addons/l10n_es_pos/**/*",
            "!addons/l10n_fr_pos_cert",
            "!addons/l10n_fr_pos_cert/**/*",
            "!addons/l10n_gcc_pos",
            "!addons/l10n_gcc_pos/**/*",
            "!addons/l10n_in_pos",
            "!addons/l10n_in_pos/**/*",
            "!addons/l10n_sa_pos",
            "!addons/l10n_sa_pos/**/*",
            "!addons/pos_adyen",
            "!addons/pos_adyen/**/*",
            "!addons/pos_discount",
            "!addons/pos_discount/**/*",
            "!addons/pos_epson_printer",
            "!addons/pos_epson_printer/**/*",
            "!addons/pos_hr",
            "!addons/pos_hr/**/*",
            "!addons/pos_hr_restaurant",
            "!addons/pos_hr_restaurant/**/*",
            "!addons/pos_loyalty",
            "!addons/pos_loyalty/**/*",
            "!addons/pos_mercury",
            "!addons/pos_mercury/**/*",
            "!addons/pos_mrp",
            "!addons/pos_mrp/**/*",
            "!addons/pos_online_payment",
            "!addons/pos_online_payment/**/*",
            "!addons/pos_online_payment_self_order",
            "!addons/pos_online_payment_self_order/**/*",
            "!addons/pos_paytm",
            "!addons/pos_paytm/**/*",
            "!addons/pos_restaurant",
            "!addons/pos_restaurant/**/*",
            "!addons/pos_restaurant_adyen",
            "!addons/pos_restaurant_adyen/**/*",
            "!addons/pos_restaurant_stripe",
            "!addons/pos_restaurant_stripe/**/*",
            "!addons/pos_sale",
            "!addons/pos_sale/**/*",
            "!addons/pos_sale_loyalty",
            "!addons/pos_sale_loyalty/**/*",
            "!addons/pos_sale_margin",
            "!addons/pos_sale_margin/**/*",
            "!addons/pos_self_order",
            "!addons/pos_self_order/**/*",
            "!addons/pos_self_order_adyen",
            "!addons/pos_self_order_adyen/**/*",
            "!addons/pos_self_order_epson_printer",
            "!addons/pos_self_order_epson_printer/**/*",
            "!addons/pos_self_order_sale",
            "!addons/pos_self_order_sale/**/*",
            "!addons/pos_self_order_stripe",
            "!addons/pos_self_order_stripe/**/*",
            "!addons/pos_six",
            "!addons/pos_six/**/*",
            "!addons/pos_stripe",
            "!addons/pos_stripe/**/*",
            "!addons/spreadsheet_dashboard_pos_hr",
            "!addons/spreadsheet_dashboard_pos_hr/**/*",

            // Whitelist enterprise pos modules
            "!l10n_cl_edi_pos",
            "!l10n_cl_edi_pos/**/*",
            "!l10n_de_pos_cert",
            "!l10n_de_pos_cert/**/*",
            "!l10n_de_pos_res_cert",
            "!l10n_de_pos_res_cert/**/*",
            "!l10n_in_reports_gstr_pos",
            "!l10n_in_reports_gstr_pos/**/*",
            "!l10n_mx_edi_pos",
            "!l10n_mx_edi_pos/**/*",
            "!l10n_pl_reports_pos_jpk",
            "!l10n_pl_reports_pos_jpk/**/*",
            "!pos_account_reports",
            "!pos_account_reports/**/*",
            "!pos_blackbox_be",
            "!pos_blackbox_be/**/*",
            "!pos_enterprise",
            "!pos_enterprise/**/*",
            "!pos_hr_mobile",
            "!pos_hr_mobile/**/*",
            "!pos_iot",
            "!pos_iot/**/*",
            "!pos_iot_six",
            "!pos_iot_six/**/*",
            "!pos_l10n_se",
            "!pos_l10n_se/**/*",
            "!pos_online_payment_self_order_preparation_display",
            "!pos_online_payment_self_order_preparation_display/**/*",
            "!pos_order_tracking_display",
            "!pos_order_tracking_display/**/*",
            "!pos_preparation_display",
            "!pos_preparation_display/**/*",
            "!pos_restaurant_appointment",
            "!pos_restaurant_appointment/**/*",
            "!pos_restaurant_preparation_display",
            "!pos_restaurant_preparation_display/**/*",
            "!pos_sale_stock_renting",
            "!pos_sale_stock_renting/**/*",
            "!pos_self_order_preparation_display",
            "!pos_self_order_preparation_display/**/*",
            "!pos_settle_due",
            "!pos_settle_due/**/*",

            // Whitelist misc enterprise modules
            "!sign",
            "!sign/**",

            "!sign_itsme",
            "!sign_itsme/**",
        ],
    },
    // Overrides unnecessary or conflicting Prettier rules.
    // Keep it last so that it can be applied on top of the conflicting configs.
    eslintPluginPrettierRecommended,
];
