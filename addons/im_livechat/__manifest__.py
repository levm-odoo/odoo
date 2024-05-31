# -*- coding: utf-8 -*-
{
    'name': 'Live Chat',
    'version': '1.0',
    'sequence': 210,
    'summary': 'Chat with your website visitors',
    'category': 'Website/Live Chat',
    'website': 'https://www.odoo.com/app/live-chat',
    'description':
        """
Live Chat Support
==========================

Allow to drop instant messaging widgets on any web page that will communicate
with the current server and dispatch visitors request amongst several live
chat operators.
Help your customers with this chat, and analyse their feedback.

        """,
    'data': [
        "security/im_livechat_channel_security.xml",
        "security/ir.model.access.csv",
        "data/mail_templates.xml",
        "data/im_livechat_channel_data.xml",
        "data/im_livechat_chatbot_data.xml",
        'data/digest_data.xml',
        'data/utm_data.xml',
        'views/chatbot_script_answer_views.xml',
        'views/chatbot_script_step_views.xml',
        'views/chatbot_script_views.xml',
        "views/rating_rating_views.xml",
        "views/discuss_channel_views.xml",
        "views/im_livechat_channel_views.xml",
        "views/im_livechat_channel_templates.xml",
        "views/im_livechat_chatbot_templates.xml",
        "views/res_users_views.xml",
        "views/digest_views.xml",
        "views/webclient_templates.xml",
        "report/im_livechat_report_channel_views.xml",
        "report/im_livechat_report_operator_views.xml"
    ],
    'demo': [
        "demo/im_livechat_channel/im_livechat_channel.xml",
        "demo/im_livechat_channel/im_livechat_session_1.xml",
        "demo/im_livechat_channel/im_livechat_session_2.xml",
        "demo/im_livechat_channel/im_livechat_session_3.xml",
        "demo/im_livechat_channel/im_livechat_session_4.xml",
        "demo/im_livechat_channel/im_livechat_session_5.xml",
        "demo/im_livechat_channel/im_livechat_session_6.xml",
        "demo/im_livechat_channel/im_livechat_session_7.xml",
        "demo/im_livechat_channel/im_livechat_session_8.xml",
        "demo/im_livechat_channel/im_livechat_session_9.xml",
        "demo/im_livechat_channel/im_livechat_session_10.xml",
        "demo/im_livechat_channel/im_livechat_session_11.xml",
    ],
    'depends': ["mail", "rating", "digest", "utm"],
    'installable': True,
    'application': True,
    'assets': {
        'web.assets_frontend': [
            'web/static/src/views/fields/file_handler.*',
            'web/static/src/views/fields/formatters.js',
            ('include', 'im_livechat.assets_embed_core'),
            'im_livechat/static/src/embed/frontend/**/*',
        ],
        'web.assets_backend': [
            'im_livechat/static/src/js/colors_reset_button/*',
            'im_livechat/static/src/js/im_livechat_chatbot_steps_one2many.js',
            'im_livechat/static/src/js/im_livechat_chatbot_script_answers_m2m.js',
            'im_livechat/static/src/views/**/*',
            'im_livechat/static/src/scss/im_livechat_history.scss',
            'im_livechat/static/src/scss/im_livechat_form.scss',
            'im_livechat/static/src/core/common/**/*',
            'im_livechat/static/src/core/public_web/**/*',
            'im_livechat/static/src/core/web/**/*',
        ],
        'web.assets_unit_tests': [
            'im_livechat/static/tests/**/*',
            ('remove', 'im_livechat/static/tests/embed/**/*'),
            ('remove', 'im_livechat/static/tests/tours/**/*'),
        ],
        'im_livechat.qunit_embed_suite': [
            'im_livechat/static/tests/embed/**/*',
        ],
        'web.assets_tests': [
            'im_livechat/static/tests/tours/**/*',
        ],
        'im_livechat.assets_embed_core': [
            ('remove', 'web/static/src/core/browser/title_service.js'),
            'mail/static/src/model/**/*',
            'mail/static/src/core/common/**/*',
            'mail/static/src/discuss/core/common/*',
            'mail/static/src/discuss/call/common/**',
            'mail/static/src/discuss/typing/**/*',
            'mail/static/src/utils/common/**/*',
            ('remove', 'mail/static/src/**/*.dark.scss'),
            "rating/static/src/core/common/**/*",
            'im_livechat/static/src/core/common/**/*',
            'im_livechat/static/src/embed/common/**/*',
        ],
        'im_livechat.assets_embed_external': [
            'im_livechat/static/src/embed/common/scss/bootstrap_overridden.scss',
            ('include', 'web._assets_helpers'),
            ('include', 'web._assets_backend_helpers'),
            'web/static/src/scss/pre_variables.scss',
            'web/static/lib/bootstrap/scss/_variables.scss',
            'web/static/lib/bootstrap/scss/_variables-dark.scss',
            'web/static/lib/bootstrap/scss/_maps.scss',
            ('include', 'web._assets_bootstrap_backend'),
            'web/static/src/scss/bootstrap_overridden.scss',
            'web/static/src/scss/ui.scss',
            'web/static/src/libs/fontawesome/css/font-awesome.css',
            'web/static/lib/odoo_ui_icons/style.css',
            'web/static/src/webclient/webclient.scss',
            ('include', 'web._assets_core'),
            'web/static/src/views/fields/formatters.js',
            'web/static/src/views/fields/file_handler.*',
            'web/static/src/scss/mimetypes.scss',
            'bus/static/src/*.js',
            'bus/static/src/services/**/*.js',
            'bus/static/src/workers/websocket_worker.js',
            'bus/static/src/workers/websocket_worker_utils.js',
            ('remove', 'bus/static/src/services/assets_watchdog_service.js'),
            ('remove', 'bus/static/src/simple_notification_service.js'),
            ('include', 'im_livechat.assets_embed_core'),
            'im_livechat/static/src/embed/external/**/*',
        ],
        'im_livechat.assets_embed_cors': [
            ('include', 'im_livechat.assets_embed_external'),
            'im_livechat/static/src/embed/cors/**/*',
        ],
        'im_livechat.embed_assets_unit_tests_setup': [
            ('include', 'web.assets_unit_tests_setup'),
            ('remove', 'im_livechat/static/**'),
            ('include', 'im_livechat.assets_embed_external'),
            ('remove', 'im_livechat/static/src/embed/external/boot.js'),
            ('remove', 'mail/static/src/discuss/core/web/discuss_core_common_service_patch.js'),
            'web/static/src/core/browser/title_service.js',
            'web/static/tests/web_test_helpers.js',
            'bus/static/tests/bus_test_helpers.js',
            'mail/static/tests/mail_test_helpers.js',
            'mail/static/tests/mail_test_helpers_contains.js',
            'im_livechat/static/tests/livechat_test_helpers.js',
            'bus/static/tests/mock_server/**/*',
            'mail/static/tests/mock_server/**/*',
            'rating/static/tests/mock_server/**/*',
            'im_livechat/static/tests/mock_server/**/*',
            'bus/static/tests/mock_websocket.js',
        ],
        'im_livechat.embed_assets_unit_tests': [
            'web/static/tests/_framework/**/*',
            'im_livechat/static/tests/embed/**/*',
        ],
        "mail.assets_public": [
            "im_livechat/static/src/core/common/**/*",
            "im_livechat/static/src/core/public_web/**/*",
        ],
    },
    'license': 'LGPL-3',
}
