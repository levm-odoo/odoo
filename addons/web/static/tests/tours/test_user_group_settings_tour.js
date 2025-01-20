import { registry } from "@web/core/registry";

registry.category("web_tour.tours").add("test_user_group_settings", {
    url: "/odoo?debug=1",
    steps: () => [
        
        {
            trigger: '.o_navbar_apps_menu button',
            content: "open menu",
            run: "click",
        },
        {
            trigger: '.o_app[data-menu-xmlid="base.menu_administration"]',
            content: "open settings",
            run: "click",
        },
        {
            trigger: 'button[data-menu-xmlid="base.menu_users"]',
            content: "open user menu",
            run: "click",
        },
        {
            trigger: 'a[data-menu-xmlid="base.menu_action_res_users"]',
            content: "open users & companies menu",
            run: "click",
        },
        {
            trigger: '.o_data_row:first-child .o_field_cell[name="name"]',
            content: "open users menu",
            run: "click",
        },

        {
            trigger: 'a.nav-link[name="technical_access_rights"]',
            content: "show Technical Access Rights",
            run: "click",
        },
        {
            trigger: '.o_notebook_content:not(.o_data_cell(:contains("Administration"))',
            content: "check if demo user does not have 'Administration' access",
        },
        {
            trigger: 'a.nav-link[name="access_rights"]',
            content: "show Access Rights",
            run: "click",
        },
        {
            trigger: '.o_cell:has(label:contains("Administration")) select.o_input',
            content: "Add 'Access Rights' access to demo user",
            run: `select 2`,
        },
        {
            trigger: 'a.nav-link[name="technical_access_rights"]',
            content: "show changes in Technical Access Rights",
            run: "click",
        },
        {
            trigger: '.o_notebook_content .o_data_cell:contains("Access Rights")',
            content: "check if demo user have 'Administration' with 'Access Rights' level",
        },
        
        {
            trigger: 'button[data-menu-xmlid="base.menu_users"]',
            content: "open user menu and auto save",
            run: "click",
        },
        {
            trigger: 'a[data-menu-xmlid="base.menu_action_res_users"]',
            content: "open users & companies menu",
            run: "click",
        },
        {
            trigger: '.o_data_row:first-child .o_field_cell[name="name"]',
            content: "open users menu",
            run: "click",
        },
        {
            trigger: '.o_notebook_content select.o_input:has(option:contains("Access Rights"):selected)',
            content: "check if demo user have 'Administration' with 'Access Rights' level",
        },
        {
            trigger: 'a.nav-link[name="technical_access_rights"]',
            content: "show Technical Access Rights",
            run: "click",
        },
        {
            trigger: '.o_notebook_content .o_data_cell:contains("Access Rights")',
            content: "check if demo user have 'Administration' with 'Access Rights' level",
        },
    ],
});
