/** @odoo-module **/

import { registry } from "@web/core/registry";
import { stepUtils } from "@web_tour/tour_service/tour_utils";

registry.category("web_tour.tours").add('project_update_tour', {
    test: true,
    url: '/web',
    steps: () => [stepUtils.showAppsMenuItem(), {
    trigger: '.o_app[data-menu-xmlid="project.menu_main_pm"]',
    run: "click",
}, {
    trigger: '.o-kanban-button-new',
    extra_trigger: '.o_project_kanban',
    width: 200,
    run: "click",
}, {
    trigger: '.o_project_name input',
    run: "edit New Project",
}, {
    trigger: '.o_open_tasks',
    run: "click .modal:visible .btn.btn-primary",
}, {
    trigger: ".o_kanban_project_tasks .o_column_quick_create .input-group input",
    run: "fill New",
}, {
    trigger: ".o_kanban_project_tasks .o_column_quick_create .o_kanban_add",
    auto: true,
    run: "click",
}, {
    trigger: ".o_kanban_project_tasks .o_column_quick_create .input-group input",
    extra_trigger: '.o_kanban_group',
    run: "fill Done",
}, {
    trigger: ".o_kanban_project_tasks .o_column_quick_create .o_kanban_add",
    auto: true,
    run: "click",
}, {
    trigger: '.o-kanban-button-new',
    extra_trigger: '.o_kanban_group:eq(0)',
    run: "click",
}, {
    trigger: '.o_kanban_quick_create div.o_field_char[name=display_name] input',
    extra_trigger: '.o_kanban_project_tasks',
    run: "edit New task",
}, {
    trigger: '.o_kanban_quick_create .o_kanban_add',
    extra_trigger: '.o_kanban_project_tasks',
    run: "click",
}, {
    trigger: '.o-kanban-button-new',
    extra_trigger: '.o_kanban_group:eq(0)',
    run: "click",
}, {
    trigger: '.o_kanban_quick_create div.o_field_char[name=display_name] input',
    extra_trigger: '.o_kanban_project_tasks',
    run: "edit Second task",
}, {
    trigger: '.o_kanban_quick_create .o_kanban_add',
    extra_trigger: '.o_kanban_project_tasks',
    run: "click",
}, {
    trigger: '.o_kanban_group:nth-child(2) .o_kanban_header .o_kanban_config .dropdown-toggle',
    run: "click",
}, {
    trigger: ".dropdown-item.o_column_edit",
    run: "click",
}, {
    trigger: ".o_field_widget[name=fold] input",
    run: "click",
}, {
    trigger: ".modal-footer button",
    run: "click",
}, {
    trigger: ".o_kanban_record .oe_kanban_content",
    extra_trigger: '.o_kanban_project_tasks',
    run: "drag_and_drop(.o_kanban_group:eq(1))",
}, {
    trigger: ".o_control_panel_navigation button i.fa-sliders",
    content: 'Open embedded actions',
    run: "click",
}, {
    trigger: ".o_embedded_actions_buttons_wrapper button i.fa-sliders",
    content: "Open embedded actions dropdown",
    run: "click",
}, {
    trigger: ".o-dropdown-item div span:contains('Project Updates')",
    content: "Put Project Updates in the embedded actions",
    run: "click",
}, {
    trigger: ".o_embedded_actions_buttons_wrapper button span:contains('Project Updates')",
    content: "Open Project Updates",
    run: "click",
}, {
    trigger: ".o_add_milestone a",
    content: "Add a first milestone",
    run: "click",
}, {
    trigger: "div.o_field_widget[name=name] input",
    run: "edit New milestone",
}, {
    trigger: "input[data-field=deadline]",
    run: "edit 12/12/2099",
}, {
    trigger: ".modal-footer .o_form_button_save",
    run: "click",
}, {
    trigger: ".o_add_milestone a",
    run: "click",
}, {
    trigger: "div.o_field_widget[name=name] input",
    run: "edit Second milestone",
}, {
    trigger: "input[data-field=deadline]",
    run: "edit 12/12/2022",
}, {
    trigger: ".modal-footer .o_form_button_save",
    run: "click",
}, {
    trigger: ".o_rightpanel_milestone:eq(1) .o_milestone_detail",
    run: "click",
}, {
    trigger: "input[data-field=deadline]",
    run: "edit 12/12/2100",
}, {
    trigger: ".modal-footer .o_form_button_save",
    run: "click",
}, {
    trigger: ".o-kanban-button-new",
    content: "Create a new update",
    run: "click",
}, {
    trigger: "div.o_field_widget[name=name] input",
    run: "edit New update",
}, {
    trigger: ".o_form_button_save",
    run: "click",
}, {
    trigger: ".o_field_widget[name='description'] h1:contains('Activities')",
}, {
    trigger: ".o_field_widget[name='description'] h3:contains('Milestones')",
}, {
    trigger: ".o_field_widget[name='description'] div[name='milestone'] ul li:contains('(12/12/2099 => 12/12/2100)')",
}, {
    trigger: ".o_field_widget[name='description'] div[name='milestone'] ul li:contains('(due 12/12/2022)')",
}, {
    trigger: ".o_field_widget[name='description'] div[name='milestone'] ul li:contains('(due 12/12/2100)')",
}, {
    trigger: '.o_back_button',
    content: 'Go back to the kanban view the project',
    run: "click",
}, {
    trigger: '.o_switch_view.o_list',
    content: 'Open List View of Project Updates',
    run: "click",
}, {
    trigger: '.o_back_button',
    content: 'Go back to the kanban view the project',
    extra_trigger: '.o_list_view',
    run: "click",
},
]});
