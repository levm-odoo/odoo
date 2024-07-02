# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'eCommerce',
    'category': 'Website/Website',
    'sequence': 50,
    'summary': 'Sell your products online',
    'website': 'https://www.odoo.com/app/ecommerce',
    'version': '1.1',
    'depends': [
        'website', 'sale', 'website_payment', 'website_mail', 'portal_rating', 'digest', 'delivery'
    ],
    'data': [
        # Security
        'security/ir.model.access.csv',
        'security/ir_rules.xml',
        'security/res_groups.xml',

        # Record data
        'data/data.xml',
        'data/mail_template_data.xml',
        'data/product_snippet_template_data.xml',
        'data/digest_data.xml',
        'data/ir_cron_data.xml',

        # Reports
        'report/sale_report_views.xml',

        # QWeb templates
        'views/delivery_form_templates.xml',
        'views/templates.xml',

        # Model views.
        'views/account_move_views.xml',
        'views/crm_team_views.xml',
        'views/delivery_carrier_views.xml',
        'views/digest_views.xml',
        'views/product_attribute_views.xml',
        'views/product_document_views.xml',
        'views/product_image_views.xml',
        'views/product_pricelist_views.xml',
        'views/product_product_add.xml',
        'views/product_public_category_views.xml',
        'views/product_ribbon_views.xml',
        'views/product_tag_views.xml',
        'views/product_views.xml',
        'views/res_config_settings_views.xml',
        'views/sale_order_views.xml',
        'views/website_base_unit_views.xml',
        'views/website_pages_views.xml',
        'views/website_sale_menus.xml',
        'views/website_sale_visitor_views.xml',
        'views/variant_templates.xml',
        'views/website_views.xml',

        # Website snippets
        'views/snippets/snippets.xml',
        'views/snippets/s_add_to_cart.xml',
        'views/snippets/s_dynamic_snippet_products.xml',
        'views/snippets/s_dynamic_snippet_products_preview_data.xml',
        'views/snippets/s_popup.xml',
    ],
    'demo': [
        'data/demo.xml',
    ],
    'installable': True,
    'application': True,
    'post_init_hook': '_post_init_hook',
    'uninstall_hook': 'uninstall_hook',
    'assets': {
        'web.assets_frontend': [
            'website_sale/static/src/js/tours/tour_utils.js',
            'website_sale/static/src/scss/website_sale.scss',
            'website_sale/static/src/scss/website_sale_frontend.scss',
            'website_sale/static/src/scss/website_sale_delivery.scss',
            'website/static/lib/multirange/multirange_custom.scss',
            'sale/static/src/scss/sale_portal.scss',

            'website_sale/static/src/scss/product_configurator.scss',

            'website_sale/static/src/js/address.js',
            'website_sale/static/src/js/cart.js',
            'website_sale/static/src/js/checkout.js',
            'website_sale/static/src/js/payment_button.js',
            'website_sale/static/src/js/payment_form.js',
            'website_sale/static/src/js/sale_variant_mixin.js',
            'website_sale/static/src/js/terms_and_conditions_checkbox.js',
            'website_sale/static/src/js/website_sale.js',
            'website_sale/static/src/xml/website_sale.xml',
            'website_sale/static/src/js/website_sale_offcanvas.js',
            'website_sale/static/src/js/website_sale_price_range_option.js',
            'website_sale/static/src/js/website_sale_product_configurator.js',
            'website_sale/static/src/js/website_sale_utils.js',
            'website_sale/static/src/xml/website_sale_utils.xml',
            'website_sale/static/src/js/website_sale_recently_viewed.js',
            'website_sale/static/src/js/website_sale_tracking.js',
            'website/static/lib/multirange/multirange_custom.js',
            'website/static/lib/multirange/multirange_instance.js',
            'website_sale/static/src/js/website_sale_category_link.js',
            'website_sale/static/src/xml/website_sale_image_viewer.xml',
            'website_sale/static/src/js/components/website_sale_image_viewer.js',
            'website_sale/static/src/xml/website_sale_reorder_modal.xml',
            'website_sale/static/src/js/website_sale_reorder.js',
            'website_sale/static/src/js/notification/add_to_cart_notification/add_to_cart_notification.js',
            'website_sale/static/src/js/notification/add_to_cart_notification/add_to_cart_notification.xml',
            'website_sale/static/src/js/notification/cart_notification/cart_notification.js',
            'website_sale/static/src/js/notification/cart_notification/cart_notification.xml',
            'website_sale/static/src/js/notification/warning_notification/warning_notification.js',
            'website_sale/static/src/js/notification/warning_notification/warning_notification.xml',
            'website_sale/static/src/js/notification/notification_service.js',
            'sale/static/src/js/badge_extra_price/*',
            'sale/static/src/js/product/*',
            'sale/static/src/js/product_configurator_dialog/*',
            'sale/static/src/js/product_list/*',
            'sale/static/src/js/product_template_attribute_line/*',
            'website_sale/static/src/js/product/*',
            'website_sale/static/src/js/product_configurator_dialog/*',
            'website_sale/static/src/js/product_list/*',
            'website_sale/static/src/js/product_template_attribute_line/*',

            # Location selector components are defined in `delivery` to share the codebase with the
            # backend.
            'delivery/static/src/js/location_selector/**/*',
            'website_sale/static/src/js/location_selector/**/*',
        ],
        'web._assets_primary_variables': [
            'website_sale/static/src/scss/primary_variables.scss',
        ],
        'web.assets_backend': [
            'website_sale/static/src/js/tours/tour_utils.js',
            'website_sale/static/src/js/website_sale_video_field_preview.js',
            'website_sale/static/src/scss/website_sale_backend.scss',
            'website_sale/static/src/js/tours/website_sale_shop.js',
            'website_sale/static/src/xml/website_sale.xml',
        ],
        'website.assets_wysiwyg': [
            'website_sale/static/src/scss/website_sale.editor.scss',
            'website_sale/static/src/snippets/s_dynamic_snippet_products/options.js',
            'website_sale/static/src/snippets/s_add_to_cart/options.js',
            'website_sale/static/src/snippets/s_add_to_cart/options.xml',
            'website_sale/static/src/js/website_sale.editor.js',
            'website_sale/static/src/js/website_sale_form_editor.js',
        ],
        'website.assets_editor': [
            'website_sale/static/src/js/systray_items/*.js',
            'website_sale/static/src/xml/website_sale_utils.xml',
        ],
        'website.backend_assets_all_wysiwyg': [
            'website_sale/static/src/js/components/wysiwyg_adapter/wysiwyg_adapter.js',
        ],
        'web.assets_tests': [
            'website_sale/static/tests/**/*',
            'website_sale/static/src/js/tours/product_configurator_tour_utils.js',
        ],
    },
    'license': 'LGPL-3',
}
