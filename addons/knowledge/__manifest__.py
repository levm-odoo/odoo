# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Knowledge',
    'summary': 'Centralize, manage, share and grow your knowledge library',
    'description': 'Centralize, manage, share and grow your knowledge library',
    'category': 'Productivity/Knowledge',
    'version': '0.1',
    'depends': [
        'web',
        'web_editor',
        'mail',
        'portal'
    ],
    'data': [
        'data/article_templates.xml',
        'data/knowledge_data.xml',
        'data/ir_actions_data.xml',
        'data/mail_templates.xml',
        'wizard/knowledge_invite_views.xml',
        'views/knowledge_article_views.xml',
        'views/knowledge_article_favorite_views.xml',
        'views/knowledge_article_member_views.xml',
        'views/knowledge_templates.xml',
        'views/knowledge_templates_common.xml',
        'views/knowledge_templates_frontend.xml',
        'views/knowledge_menus.xml',
        'security/ir.model.access.csv',
        'security/ir_rule.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
    'post_init_hook': '_init_private_article_per_user',
    'assets': {
        'web.assets_backend': [
            'web/static/fonts/fonts.scss',
            'knowledge/static/src/components/*/*.scss',
            'knowledge/static/src/components/*/*.js',
            'knowledge/static/src/scss/knowledge_views.scss',
            'knowledge/static/src/scss/knowledge_editor.scss',
            'knowledge/static/src/scss/knowledge_blocks.scss',
            'knowledge/static/src/components/*/*.js',
            'knowledge/static/src/js/knowledge_controller.js',
            'knowledge/static/src/js/knowledge_renderers.js',
            'knowledge/static/src/js/knowledge_views.js',
            'knowledge/static/src/js/widgets/knowledge_dialogs.js',
            'knowledge/static/src/js/tools/tree_panel_mixin.js',
            'knowledge/static/src/js/widgets/knowledge_permission_panel.js',
            'knowledge/static/src/js/widgets/knowledge_emoji_picker.js',
            'knowledge/static/src/js/widgets/knowledge_field_html.js',
            'knowledge/static/src/webclient/commands/*.js',
            'knowledge/static/src/models/*/*.js',
            'knowledge/static/src/js/form_controller.js',
            'knowledge/static/src/js/form_renderer.js',
            'knowledge/static/src/js/knowledge_macros.js',
            'knowledge/static/src/js/knowledge_behaviors.js',
            'knowledge/static/src/js/knowledge_toolbars.js',
            'knowledge/static/src/js/knowledge_field_html_injector.js',
            'knowledge/static/src/js/knowledge_plugin.js',
            'knowledge/static/src/js/field_html.js',
            'knowledge/static/src/js/knowledge_service.js',
        ],
        'web.assets_frontend': [
            'knowledge/static/src/scss/knowledge_frontend.scss',
            'knowledge/static/src/scss/knowledge_blocks.scss',
            'knowledge/static/src/js/knowledge_frontend.js',
            'knowledge/static/src/js/tools/tree_panel_mixin.js',
        ],
        'web_editor.assets_wysiwyg': [
            'knowledge/static/src/js/wysiwyg/knowledge_article_link.js',
            'knowledge/static/src/js/wysiwyg.js',
            'knowledge/static/src/js/knowledge_toolbars_edit.js',
            'knowledge/static/src/js/knowledge_clipboard_whitelist.js'
        ],
        'web.assets_qweb': [
            'knowledge/static/src/components/*/*.xml',
            'knowledge/static/src/xml/knowledge_editor.xml',
            'knowledge/static/src/xml/knowledge_templates.xml',
            'knowledge/static/src/xml/chatter_topbar.xml',
            'knowledge/static/src/xml/knowledge_command_palette.xml',
            'knowledge/static/src/xml/knowledge_toolbars.xml',
        ],
        'web.assets_tests': [
            'knowledge/static/tests/tours/*.js',
        ],
        'web.qunit_suite_tests': [
            'knowledge/static/tests/test_services.js',
        ],
        'web.qunit_mobile_suite_tests': [
            'knowledge/static/tests/test_services.js',
        ],
    },
}
