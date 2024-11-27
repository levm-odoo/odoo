odoo.define('purchase.purchase_steps', function (require) {
"use strict";

var core = require('web.core');

var PurchaseAdditionalTourSteps = core.Class.extend({

    _get_purchase_stock_steps: function () {
        return [
            {
                auto: true, // Useless final step to trigger congratulation message
                trigger: ".o_purchase_order",
            },
        ];
    },

});

return PurchaseAdditionalTourSteps;

});

odoo.define('purchase.tour', function(require) {
"use strict";

var core = require('web.core');
var tour = require('web_tour.tour');

var _t = core._t;
var PurchaseAdditionalTourSteps = require('purchase.purchase_steps');

tour.register('purchase_tour' , {
    url: "/web",
    sequence: 40,
}, [tour.stepUtils.showAppsMenuItem(), {
    trigger: '.o_app[data-menu-xmlid="purchase.menu_purchase_root"]',
    content: _t("Let's try the Purchase app to manage the flow from purchase to reception and invoice control."),
    position: 'right',
    edition: 'community'
}, {
    trigger: '.o_app[data-menu-xmlid="purchase.menu_purchase_root"]',
    content: _t("Let's try the Purchase app to manage the flow from purchase to reception and invoice control."),
    position: 'bottom',
    edition: 'enterprise'
}, {
    trigger: ".o_list_button_add",
    extra_trigger: ".o_purchase_order",
    content: _t("Let's create your first request for quotation."),
    position: "bottom",
}, {
    trigger: ".o_form_editable .o_field_res_partner_many2one[name='partner_id']",
    extra_trigger: ".o_purchase_order",
    content: _t("Search a vendor name, or create one on the fly."),
    position: "bottom",
    run: function (actions) {
        actions.text("Azure Interior", this.$anchor.find("input"));
    },
}, {
    trigger: ".ui-menu-item > a:contains('Azure Interior')",
    auto: true,
    in_modal: false,
}, {
    content: "Add items",
    trigger: '.o_field_x2many_list_row_add a:contains("Add a product")',
},
{
    content: "Select input",
    trigger: 'div[name="product_id"] input, div[name="product_template_id"] input',
},
{
    content: "Type item",
    trigger: 'div[name="product_id"] input, div[name="product_template_id"] input',
    run: function (actions) {
        var $input = this.$anchor.find('input');
        actions.text("DESK0001", $input.length === 0 ? this.$anchor : $input);
        // fake keydown to trigger search
        var keyDownEvent = jQuery.Event("keydown");
        keyDownEvent.which = 42;
        this.$anchor.trigger(keyDownEvent);
        var $descriptionElement = $('div[name="name"] textarea');
        // when description changes, we know the product has been created
        $descriptionElement.change(function () {
            $descriptionElement.addClass('product_creation_success');
        });
    },
},{
    trigger: "a:contains('DESK0001')",
    auto: true,
}, {
    trigger: "td[name='name'][data-tooltip*='DESK0001']",
    run: function () {}
}, {
    content: "Select item quantity",
    trigger: 'tbody tr.o_data_row .o_list_number[name="product_qty"]',
},
{
    content: "Change item quantity",
    trigger: 'tbody tr.o_data_row .o_list_number[name="product_qty"] input',
    run: 'text 2',
},
{
    content: "Valid the new value",
    trigger: 'tbody tr.o_data_row .o_list_number[name="product_qty"] input',
    run: function (actions) {
        let keydownEvent = jQuery.Event('keydown');
        keydownEvent.which = 13;
        this.$anchor.trigger(keydownEvent);
    },
},
{
    content: "Save the account move",
    trigger: '.o_form_button_save',
},
...tour.stepUtils.statusbarButtonsSteps('Send by Email', _t("Send the request for quotation to your vendor."), ".o_statusbar_buttons button[name='action_rfq_send']"),
{
    trigger: ".modal-content",
    auto: true,
    run: function(actions){
        // Check in case user must add email to vendor
        var $input = $(".modal-content input[name='email']");
        if ($input.length) {
            actions.text("agrolait@example.com", $input);
            actions.click($(".modal-footer button"));
        }
    }
}, {
    trigger: ".modal-footer button[name='action_send_mail']",
    extra_trigger: ".modal-footer button[name='action_send_mail']",
    content: _t("Send the request for quotation to your vendor."),
    position: "left",
    run: 'click',
}, {
    content: "Select item quantity",
    trigger: 'tbody tr.o_data_row .o_list_number[name="price_unit"]',
}, {
    content: "Change item quantity",
    trigger: 'tbody tr.o_data_row .o_list_number[name="price_unit"] input',
    run: 'text 200.00',
}, {
    content: "Valid the new value",
    trigger: 'tbody tr.o_data_row .o_list_number[name="price_unit"] input',
    run: function (actions) {
        let keydownEvent = jQuery.Event('keydown');
        keydownEvent.which = 13;
        this.$anchor.trigger(keydownEvent);
    },
},  {
    content: "Save the account move",
    trigger: '.o_form_button_save',
},
{
    auto: true,
    trigger: ".o_purchase_order",
    run: 'click',
}, ...tour.stepUtils.statusbarButtonsSteps('Confirm Order', _t("Confirm your purchase.")),
...new PurchaseAdditionalTourSteps()._get_purchase_stock_steps(),
]);

});
