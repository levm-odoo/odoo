/** @odoo-module **/
import { TourError } from "@web_tour/tour_service/tour_utils";
import { registry } from "@web/core/registry";

registry.category("web_tour.tours").add('test_detailed_op_no_save_1', { test: true, steps: () => [
    {trigger: '.o_field_x2many_list_row_add > a'},
    {
        trigger: ".o_field_widget[name=product_id] input",
        run: 'text Lot',
    },
    {trigger: ".ui-menu-item > a:contains('Product Lot')"},
    {trigger: ".btn-primary[name=action_confirm]"},
    {trigger: ".fa-list"},
    {trigger: "h4:contains('Stock move')"},
    {trigger: '.o_field_x2many_list_row_add > a'},
    {
        trigger: ".o_field_widget[name=lot_name] input",
        run: 'text lot1',
    },
    {
        trigger: ".o_field_widget[name=quantity] input",
        run: 'text 4',
    },
    {trigger: ".o_form_button_save"},
    {trigger: ".o_optional_columns_dropdown_toggle"},
    {
        trigger: 'input[name="picked"]',
        content: 'Check the picked field to display the column on the list view.',
        run: function (actions) {
            if (!this.$anchor.prop('checked')) {
                actions.click(this.$anchor);
            }
        },
    },
    {trigger: ".o_data_cell[name=picked]"},
    {
        trigger: ".o_field_widget[name=picked] input",
        run: function (actions) {
            if (!this.$anchor.prop('checked')) {
                actions.click(this.$anchor);
            }
        }
    },
    {trigger: ".btn-primary[name=button_validate]"},
    {
        trigger: ".o_control_panel_actions button:contains('Traceability')",
        isCheck: true,
    },
]});

registry.category("web_tour.tours").add('test_generate_serial_1', { test: true, steps: () => [
    {trigger: '.o_field_x2many_list_row_add > a'},
    {
        trigger: ".o_field_widget[name=product_id] input",
        run: 'text Serial',
    },
    {trigger: ".ui-menu-item > a:contains('Product Serial')"},
    {trigger: ".btn-primary[name=action_confirm]"},
    {trigger: ".fa-list"},
    {trigger: "h4:contains('Stock move')"},
    {trigger: '.o_widget_generate_serials > button'},
    {trigger: "h4:contains('Generate Serials numbers')"},
    {
        trigger: "div[name=next_serial] input",
        run: 'text serial_n_1',
    },
    {
        trigger: "div[name=next_serial_count] input",
        run: 'text 5',
    },
    {trigger: ".btn-primary:contains('Generate')"},
    {
        trigger: "span[data-tooltip=Quantity]:contains('5')",
        run: () => {
            const nbLines = document.querySelectorAll(".o_field_cell[name=lot_name]").length;
            if (nbLines !== 5){
                throw new TourError("wrong number of move lines generated. " + nbLines + " instead of 5");
            }
        },
    },
    {trigger: ".o_form_button_save"},
    {trigger: ".o_optional_columns_dropdown_toggle"},
    {
        trigger: 'input[name="picked"]',
        content: 'Check the picked field to display the column on the list view.',
        run: function (actions) {
            if (!this.$anchor.prop('checked')) {
                actions.click(this.$anchor);
            }
        },
    },
    {trigger: ".o_data_cell[name=picked]"},
    {
        trigger: ".o_field_widget[name=picked] input",
        run: function (actions) {
            if (!this.$anchor.prop('checked')) {
                actions.click(this.$anchor);
            }
        }
    },
    {trigger: ".btn-primary[name=button_validate]"},
    {
        trigger: ".o_control_panel_actions button:contains('Traceability')",
        isCheck: true,
    },
]});

registry.category("web_tour.tours").add('test_add_new_line', {
    test: true,
    steps: () => [
        {
            extra_trigger: '.o_form_editable',
            trigger: '.o_field_x2many_list_row_add > a'
        },
        {
            trigger: ".o_field_widget[name=product_id] input",
            run: 'text two',
        },
        { trigger: ".ui-menu-item > a:contains('Product two')" },
        { trigger: ".fa-list:eq(1)" },
        { trigger: "h4:contains('Stock move')" },
        { trigger: '.o_field_x2many_list_row_add > a' },
        {
            trigger: ".o_field_widget[name=lot_name] input",
            run: 'text two',
        },
        { trigger: ".o_form_view.modal-content .o_form_button_save" },
        { trigger: ".o_form_view:not(.modal-content) .o_form_button_save" },
        {
            trigger: ".o_form_renderer.o_form_saved",
            isCheck: true,
        },
    ]
});

registry.category("web_tour.tours").add('test_edit_existing_line', {
    test: true,
    steps: () => [
        { trigger: ".o_data_cell[name=quantity]" },
        {
            trigger: ".o_field_widget[name=quantity] input",
            run: 'text 2',
        },
        { trigger: ".fa-list" },
        { trigger: "h4:contains('Stock move')" },
        { trigger: ".o_data_cell[name=quantity]:eq(1)" },
        {
            trigger: ".o_field_widget[name=lot_name] input",
            run: 'text two',
        },
        { trigger: ".o_form_view.modal-content .o_form_button_save" },
        { trigger: ".o_form_view:not(.modal-content) .o_form_button_save" },
        {
            trigger: ".o_form_renderer.o_form_saved",
            isCheck: true,
        },
    ]
});

registry.category("web_tour.tours").add('test_onchange_twice_lot_ids', {
    test: true,
    steps: () => [
        { trigger: ".o_optional_columns_dropdown_toggle" },
        { trigger: ".dropdown-item:contains('Serial Numbers')"},
        { trigger: ".o_data_cell.o_many2many_tags_cell"},
        { trigger: ".oi-close:first"},
        { trigger: ".oi-close:first"},
        { trigger: ".o_form_button_save"},
        {
            trigger: ".o_form_renderer.o_form_saved",
            isCheck: true,
        },
    ]
});
