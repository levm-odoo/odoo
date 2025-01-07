# Part of Odoo. See LICENSE file for full copyright and licensing details.

from lxml import html
from werkzeug.urls import url_encode

from odoo.tests import HttpCase, tagged
from odoo.addons.website.tools import MockRequest, create_image_attachment
from odoo.tests.common import HOST
from odoo.tools import config


@tagged('post_install', '-at_install', 'website_snippets')
class TestSnippets(HttpCase):

    def test_01_empty_parents_autoremove(self):
        self.start_tour(self.env['website'].get_client_action_url('/'), 'snippet_empty_parent_autoremove', login='admin')

    def test_02_default_shape_gets_palette_colors(self):
        self.start_tour('/@/', 'default_shape_gets_palette_colors', login='admin')

    def test_03_snippets_all_drag_and_drop(self):
        with MockRequest(self.env, website=self.env['website'].browse(1)):
            snippets_template = self.env['ir.ui.view'].render_public_asset('website.snippets')
        html_template = html.fromstring(snippets_template)
        data_snippet_els = html_template.xpath("//*[snippets and not(hasclass('d-none'))]//*[@data-oe-snippet-key]/*[@data-snippet]")

        # FIXME targeting data-oe-snippet-key should be enough to find actual
        # snippets, but the current xpath search for inner data-snippet too as
        # it currently missing on some snippet (e.g. accordion?)
        data_snippet_els = [el.getparent() for el in data_snippet_els]

        blacklist = [
            's_facebook_page',  # avoid call to external services (facebook.com)
            's_map',  # avoid call to maps.google.com
            's_instagram_page',  # avoid call to instagram.com
            's_image',  # Avoid specific case where the media dialog opens on drop
            's_snippet_group',  # Snippet groups are not snippets
        ]
        snippets_names = ','.join({
            f"{el.attrib['data-oe-snippet-key']}:{el.attrib.get('data-o-group', '')}"
            for el in data_snippet_els
            if el.attrib['data-oe-snippet-key'] not in blacklist
        })
        snippets_names_encoded = url_encode({'snippets_names': snippets_names})
        path = url_encode({
            'path': '/?' + snippets_names_encoded
        })
        if 'mail.group' in self.env and not self.env['mail.group'].search_count([]):
            self.env['mail.group'].create({
                'name': 'My Mail Group',
                'alias_name': 'my_mail_group',
            })
        self.start_tour(f"/odoo/action-website.website_preview?{path}", "snippets_all_drag_and_drop", login='admin', timeout=600)

    def test_04_countdown_preview(self):
        self.start_tour(self.env['website'].get_client_action_url('/'), 'snippet_countdown', login='admin')

    def test_05_social_media(self):
        self.env.ref('website.default_website').write({
            'social_facebook': "https://www.facebook.com/Odoo",
            'social_twitter': 'https://twitter.com/Odoo',
            'social_linkedin': 'https://www.linkedin.com/company/odoo',
            'social_youtube': 'https://www.youtube.com/user/OpenERPonline',
            'social_github': 'https://github.com/odoo',
            'social_instagram': 'https://www.instagram.com/explore/tags/odoo/',
            'social_tiktok': 'https://www.tiktok.com/@odoo',
        })
        create_image_attachment(self.env, '/web/image/website.s_banner_default_image', 's_banner_default_image.jpg')
        self.start_tour(self.env['website'].get_client_action_url('/'), 'snippet_social_media', login="admin")
        self.assertEqual(
            self.env['website'].browse(1).social_instagram,
            'https://instagram.com/odoo.official/',
            'Social media should have been updated'
        )

    def test_06_snippet_popup_add_remove(self):
        self.start_tour(self.env['website'].get_client_action_url('/'), 'snippet_popup_add_remove', login='admin')

    def test_07_image_gallery(self):
        self.start_tour(self.env['website'].get_client_action_url('/'), 'snippet_image_gallery', login='admin')

    def test_08_table_of_content(self):
        self.start_tour(self.env['website'].get_client_action_url('/'), 'snippet_table_of_content', login='admin')

    def test_09_snippet_image_gallery(self):
        create_image_attachment(self.env, '/web/image/website.s_banner_default_image.jpg', 's_default_image.jpg')
        create_image_attachment(self.env, '/web/image/website.s_banner_default_image.jpg', 's_default_image2.jpg')
        self.start_tour("/", "snippet_image_gallery_remove", login='admin')

    def test_10_parallax(self):
        self.start_tour(self.env['website'].get_client_action_url('/'), 'test_parallax', login='admin')

    def test_11_snippet_popup_display_on_click(self):
        self.start_tour(self.env['website'].get_client_action_url('/'), 'snippet_popup_display_on_click', login='admin')

    def test_12_snippet_images_wall(self):
        self.start_tour('/', 'snippet_images_wall', login='admin')

    def test_snippet_popup_with_scrollbar_and_animations(self):
        website = self.env.ref('website.default_website')
        website.cookies_bar = True
        self.start_tour(self.env['website'].get_client_action_url('/'), 'snippet_popup_and_scrollbar', login='admin')
        self.start_tour(self.env['website'].get_client_action_url('/'), 'snippet_popup_and_animations', login='admin', timeout=90)

    def test_drag_and_drop_on_non_editable(self):
        self.start_tour(self.env['website'].get_client_action_url('/'), 'test_drag_and_drop_on_non_editable', login='admin')

    def test_snippet_image_gallery_reorder(self):
        self.start_tour(self.env['website'].get_client_action_url('/'), "snippet_image_gallery_reorder", login='admin')

    def test_snippet_image_gallery_thumbnail_update(self):
        create_image_attachment(self.env, '/web/image/website.s_banner_default_image', 's_default_image.jpg')
        self.start_tour(self.env['website'].get_client_action_url('/'), 'snippet_image_gallery_thumbnail_update', login='admin')

    def test_dropdowns_and_header_hide_on_scroll(self):
        self.env.ref('base.user_admin').write({
            'name': 'mitchell admin',
            'email': 'mitchell.admin@example.com',
        })
        self.start_tour(self.env['website'].get_client_action_url('/'), 'dropdowns_and_header_hide_on_scroll', login='admin')

    def test_snippet_image(self):
        create_image_attachment(self.env, '/web/image/website.s_banner_default_image', 's_default_image.jpg')
        self.start_tour(self.env['website'].get_client_action_url('/'), 'snippet_image', login='admin')

    def test_rating_snippet(self):
        self.start_tour(self.env["website"].get_client_action_url("/"), "snippet_rating", login="admin")

    def test_snippet_cards(self):
        self.start_tour(self.env["website"].get_client_action_url("/"), "snippet_cards_soft", login="admin")
        self.start_tour(self.env["website"].get_client_action_url("/"), "snippet_cards_grid", login="admin")
