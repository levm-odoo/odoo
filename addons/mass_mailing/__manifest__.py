# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Email Marketing',
    'summary': 'Design, send and track emails',
    'version': '2.5',
    'sequence': 60,
    'website': 'https://www.odoo.com/app/email-marketing',
    'category': 'Marketing/Email Marketing',
    'depends': [
        'contacts',
        'mail',
        'utm',
        'link_tracker',
        'web_editor',
        'web_kanban_gauge',
        'social_media',
        'web_tour',
        'digest',
    ],
    'data': [
        'security/res_groups_data.xml',
        'security/ir.model.access.csv',
        'data/digest_data.xml',
        'data/ir_attachment_data.xml',
        'data/ir_config_parameter_data.xml',
        'data/ir_cron_data.xml',
        'data/ir_module_data.xml',
        'data/ir_actions_server_data.xml',
        'data/mailing_data_templates.xml',
        'data/mailing_list_data.xml',
        'data/res_users_data.xml',
        'wizard/mail_compose_message_views.xml',
        'wizard/mailing_contact_import_views.xml',
        'wizard/mailing_contact_to_list_views.xml',
        'wizard/mailing_mailing_test_views.xml',
        'wizard/mailing_mailing_schedule_date_views.xml',
        'report/mailing_trace_report_views.xml',
        'views/mailing_filter_views.xml',
        'views/mailing_trace_views.xml',
        'views/link_tracker_views.xml',
        'views/mailing_contact_views.xml',
        'views/mailing_contact_subscription_views.xml',
        'views/mailing_list_views.xml',
        'views/mailing_mailing_views.xml',
        'views/res_config_settings_views.xml',
        'views/utm_campaign_views.xml',
        'views/mailing_menus.xml',
        'views/assets.xml',
        'views/mailing_templates_portal_layouts.xml',
        'views/mailing_templates_portal_management.xml',
        'views/mailing_templates_portal_unsubscribe.xml',
        'views/themes_templates.xml',
        'views/snippets_themes.xml',
        'views/snippets/s_alert.xml',
        'views/snippets/s_blockquote.xml',
        'views/snippets/s_call_to_action.xml',
        'views/snippets/s_coupon_code.xml',
        'views/snippets/s_cover.xml',
        'views/snippets/s_color_blocks_2.xml',
        'views/snippets/s_company_team.xml',
        'views/snippets/s_comparisons.xml',
        'views/snippets/s_event.xml',
        'views/snippets/s_features.xml',
        'views/snippets/s_features_grid.xml',
        'views/snippets/s_hr.xml',
        'views/snippets/s_image_text.xml',
        'views/snippets/s_masonry_block.xml',
        'views/snippets/s_media_list.xml',
        'views/snippets/s_numbers.xml',
        'views/snippets/s_picture.xml',
        'views/snippets/s_product_list.xml',
        'views/snippets/s_rating.xml',
        'views/snippets/s_references.xml',
        'views/snippets/s_showcase.xml',
        'views/snippets/s_text_block.xml',
        'views/snippets/s_text_highlight.xml',
        'views/snippets/s_text_image.xml',
        'views/snippets/s_three_columns.xml',
        'views/snippets/s_title.xml',
    ],
    'demo': [
        'data/mass_mailing_demo.xml',
    ],
    'application': True,
    'assets': {
        'web.assets_backend': [
            'mass_mailing/static/src/scss/mailing_filter_widget.scss',
            'mass_mailing/static/src/scss/mass_mailing.scss',
            'mass_mailing/static/src/scss/mass_mailing_mobile.scss',
            'mass_mailing/static/src/scss/mass_mailing_mobile_preview.scss',
            'mass_mailing/static/src/css/email_template.css',
            'mass_mailing/static/src/views/*.js',
            'mass_mailing/static/src/js/mailing_m2o_filter.js',
            'mass_mailing/static/src/js/mass_mailing.js',
            'mass_mailing/static/src/js/mass_mailing_design_constants.js',
            'mass_mailing/static/src/js/mass_mailing_mobile_preview.js',
            'mass_mailing/static/src/js/mass_mailing_html_field.js',
            'mass_mailing/static/src/js/mailing_mailing_view_form_full_width.js',
            'mass_mailing/static/src/js/mailing_portal.js',
            'mass_mailing/static/src/xml/mailing_filter_widget.xml',
            'mass_mailing/static/src/xml/mass_mailing.xml',
            'mass_mailing/static/src/views/*.xml',
        ],
        'mass_mailing.assets_mail_themes': [
            'mass_mailing/static/src/scss/themes/**/*',
        ],
        'mass_mailing.assets_mail_themes_edition': [
            ('include', 'web._assets_helpers'),
            'web/static/src/scss/pre_variables.scss',
            'web/static/lib/bootstrap/scss/_variables.scss',
            'mass_mailing/static/src/scss/mass_mailing.ui.scss',
        ],
        'web_editor.assets_wysiwyg': [
            'mass_mailing/static/src/js/snippets.editor.js',
            'mass_mailing/static/src/js/wysiwyg.js',
            'mass_mailing/static/src/xml/mass_mailing.editor.xml',
        ],
        'web.assets_common': [
            'mass_mailing/static/src/js/tours/**/*',
        ],
        'web.assets_frontend': [
            'mass_mailing/static/src/js/tours/**/*',
        ],
        'web.qunit_suite_tests': [
            'mass_mailing/static/tests/mass_mailing_favourite_filter_tests.js',
            'mass_mailing/static/src/js/mass_mailing_snippets.js',
            'mass_mailing/static/src/snippets/s_media_list/options.js',
            'mass_mailing/static/src/snippets/s_showcase/options.js',
            'mass_mailing/static/src/snippets/s_rating/options.js',
            'mass_mailing/static/tests/mass_mailing_html_tests.js',
        ],
    },
    'license': 'LGPL-3',
}
