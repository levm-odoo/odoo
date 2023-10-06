from lxml import html
import base64
import hashlib
import secrets

from odoo import _, api, Command, fields, models

from ..utils.image_utils import scale_image_b64
from .card_template import TEMPLATE_DIMENSIONS

class CardCampaign(models.Model):
    _name = 'card.campaign'
    _description = 'Marketing Card Campaign'
    _inherit = ['mail.activity.mixin', 'mail.render.mixin', 'mail.thread']
    _order = 'id DESC'

    def _default_card_template_id(self):
        return self.env['card.template'].search([], limit=1)

    def default_get(self, fields_list):
        default_vals = super().default_get(fields_list)
        if 'card_element_ids' in fields_list and 'card_element_ids' not in default_vals:
            default_vals.setdefault('card_element_ids', [
                Command.create({'card_element_role': 'background', 'render_type': 'image'}),
                Command.create({'card_element_role': 'header', 'render_type': 'text'}),
                Command.create({'card_element_role': 'subheader', 'render_type': 'text'}),
                Command.create({'card_element_role': 'section_1', 'render_type': 'text'}),
                Command.create({'card_element_role': 'subsection_1', 'render_type': 'text'}),
                Command.create({'card_element_role': 'subsection_2', 'render_type': 'text'}),
                Command.create({'card_element_role': 'button', 'render_type': 'text'}),
                Command.create({'card_element_role': 'image_1', 'render_type': 'image'}),
                Command.create({'card_element_role': 'image_2', 'render_type': 'image'}),
            ])
        return default_vals

    name = fields.Char(required=True)
    active = fields.Boolean(default=True)
    body_html = fields.Html(related='card_template_id.body', render_engine="qweb")

    card_count = fields.Integer(compute='_compute_card_stats')
    card_click_count = fields.Integer(compute='_compute_card_stats')
    card_share_count = fields.Integer(compute='_compute_card_stats')

    card_template_id = fields.Many2one('card.template', string="Design", default=_default_card_template_id, required=True)
    card_element_ids = fields.One2many('card.campaign.element', inverse_name='campaign_id', copy=True)
    image_preview = fields.Image(compute='_compute_image_preview', readonly=True, store=True, attachment=False)
    link_tracker_id = fields.Many2one('link.tracker', ondelete="restrict")
    res_model = fields.Selection(string="Model Name", selection=[('res.partner', 'Contact')], compute="_compute_res_model",
                                 copy=True, precompute=True, readonly=False, required=True, store=True)

    post_suggestion = fields.Text(help="Default text when sharing on X")
    preview_record_ref = fields.Reference(string="Preview Record", selection="_selection_preview_record_ref")
    preview_record_url = fields.Char('Preview Record Link', compute="_compute_preview_record_url")
    reward_message = fields.Html(string='Thanks to You Message')
    reward_target_url = fields.Char(string='Reward Link')
    tag_ids = fields.Many2many('card.campaign.tag', string='Tags')
    target_url = fields.Char(string='Shared Link')
    target_url_click_count = fields.Integer(related="link_tracker_id.count")

    user_id = fields.Many2one('res.users', string='Responsible', default=lambda self: self.env.user, domain="[('share', '=', False)]")
    utm_campaign_id = fields.Many2one('utm.campaign', string='UTM Campaign', ondelete='set null')

    random_token = fields.Char(readonly=True, required=True, default=lambda self: secrets.token_urlsafe())

    def _compute_card_stats(self):
        cards_by_status_count = self.env['card.card']._read_group(
            domain=[('campaign_id', 'in', self.ids)],
            groupby=['campaign_id', 'share_status'],
            aggregates=['__count'],
            order='campaign_id ASC',
        )
        self.update({
            'card_count': 0,
            'card_click_count': 0,
            'card_share_count': 0,
        })
        for campaign, status, count in cards_by_status_count:
            # shared cards are implicitly visited
            if status == 'shared':
                campaign.card_share_count += count
            if status:
                campaign.card_click_count += count
            campaign.card_count += count

    def _get_generic_image_b64(self):
        """Render a single preview image with no record."""
        # fragment_fromstring to match mail render mixin
        # sanitation will remove the base document structure, leaving <style> in the div
        # but webkit will fix it and interpret it properly
        rendered_body = self.env['ir.qweb']._render(
            html.fragment_fromstring(self.body_html, create_parent='div'),
            self._render_eval_context() | {
                'card_campaign': self,
                'preview_values': {
                    'header': _('Title'),
                    'subheader': _('Subtitle'),
                }
            },
            raise_on_code=False,
        )
        image_bytes = self.env['ir.actions.report']._run_wkhtmltoimage(
            [rendered_body],
            *TEMPLATE_DIMENSIONS
        )[0]
        return image_bytes and base64.b64encode(image_bytes)

    @api.depends('body_html', 'card_element_ids', 'preview_record_ref', 'res_model', 'card_element_ids.card_element_role',
                 'card_element_ids.card_element_image', 'card_element_ids.card_element_text', 'card_element_ids.field_path',
                 'card_element_ids.text_color', 'card_element_ids.render_type', 'card_element_ids.value_type',)
    def _compute_image_preview(self):
        rendered_campaigns = self.filtered('card_template_id.body').filtered('card_element_ids')
        (self - rendered_campaigns).image_preview = False

        for campaign in rendered_campaigns:
            if campaign.preview_record_ref and campaign.preview_record_ref.exists():
                image = campaign._get_image_b64(campaign.preview_record_ref)
            else:
                image = campaign._get_generic_image_b64()
            # scaled image for network transfers in onchange, for reactivity
            campaign.image_preview = scale_image_b64(image, 0.5)

    @api.depends('preview_record_ref')
    def _compute_preview_record_url(self):
        self.preview_record_url = False
        for campaign in self.filtered('preview_record_ref'):
            if campaign._origin.id:
                campaign.preview_record_url = campaign._get_preview_url_from_res_id(campaign.preview_record_ref.id)

    @api.depends('preview_record_ref')
    def _compute_res_model(self):
        for campaign in self:
            if campaign.preview_record_ref:
                campaign.res_model = campaign.preview_record_ref._name
            elif not campaign.res_model:
                print(campaign.res_model)
                campaign.res_model = 'res.partner'

    @api.model_create_multi
    def create(self, create_vals):
        utm_source = self.env.ref('marketing_card.utm_source_marketing_card', raise_if_not_found=False)
        utm_campaigns = self.env['utm.campaign'].sudo().create([{
            'title': vals['name'],
            'user_id': vals.get('user_id', self.default_get(['user_id'])['user_id']),
        } for vals in create_vals])
        link_trackers = self.env['link.tracker'].sudo().create([
            {
                'url': vals.get('target_url') or self.get_base_url(),
                'title': vals['name'],  # not having this will trigger a request in the create
                'source_id': utm_source.id if utm_source else None,
                'campaign_id': utm_campaign.id,
            }
            for vals, utm_campaign in zip(create_vals, utm_campaigns)
        ])
        return super().create([{
            **vals,
            'link_tracker_id': link_tracker_id,
            'utm_campaign_id': utm_campaign_id,
        } for vals, link_tracker_id, utm_campaign_id in zip(
            create_vals, link_trackers.ids, utm_campaigns.ids
        )])

    def write(self, vals):
        link_tracker_vals = {}
        utm_campaign_vals = {}
        current_models = self.mapped('res_model')

        if 'utm_campaign_id' in vals:
            link_tracker_vals['campaign_id'] = vals['utm_campaign_id']
        if 'target_url' in vals:
            link_tracker_vals['url'] = vals['target_url'] or self.get_base_url()
        if 'name' in vals:
            utm_campaign_vals['title'] = vals['name']
        if 'user_id' in vals:
            utm_campaign_vals['user_id'] = vals['user_id']
        if link_tracker_vals:
            self.link_tracker_id.sudo().write(link_tracker_vals)
        if utm_campaign_vals:
            self.utm_campaign_id.sudo().write(utm_campaign_vals)

        write_res = super().write(vals)

        changed_model_campaigns = self.env['card.campaign']
        for campaign, previous_model in zip(self, current_models):
            if campaign.res_model != previous_model:
                changed_model_campaigns += campaign
        changed_model_campaigns.card_element_ids.value_type = 'static'

        return write_res

    @api.model
    def _selection_preview_record_ref(self):
        return self._fields['res_model']._description_selection(self.env)

    def action_view_cards(self):
        self.ensure_one()
        return self.env["ir.actions.actions"]._for_xml_id("marketing_card.cards_card_action") | {
            'context': {},
            'domain': [('campaign_id', '=', self.id)],
        }

    def action_view_cards_clicked(self):
        self.ensure_one()
        return self.env["ir.actions.actions"]._for_xml_id("marketing_card.cards_card_action") | {
            'context': {'search_default_filter_visited': True},
            'domain': [('campaign_id', '=', self.id)],
        }

    def action_view_cards_shared(self):
        self.ensure_one()
        return self.env["ir.actions.actions"]._for_xml_id("marketing_card.cards_card_action") | {
            'context': {'search_default_filter_shared': True},
            'domain': [('campaign_id', '=', self.id)],
        }

    def action_share(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Send Cards'),
            'res_model': 'card.card.share',
            'context': {'default_card_campaign_id': self.id, 'default_subject': self.name},
            'views': [[False, 'form']],
            'target': 'new',
        }

    def _get_image_b64(self, record=None):
        if not self.card_template_id.body:
            return ''
        image_bytes = self.env['ir.actions.report']._run_wkhtmltoimage(
            [self._render_field('body_html', record.ids, add_context={'card_campaign': self})[record.id]],
            *TEMPLATE_DIMENSIONS
        )[0]
        return image_bytes and base64.b64encode(image_bytes)

    # CARD CREATION

    def _generate_card_hash_token(self, record_id):
        """Generate a token for a specific recipient of this campaign."""
        self.ensure_one()
        token = (self._origin.id, self.create_date, self.random_token, record_id)
        return hashlib.sha256(repr(token).encode('utf-8')).hexdigest()

    def _get_or_create_cards_from_res_ids(self, res_ids):
        """Create missing cards for the given ids."""
        self.ensure_one()
        cards = self.env['card.card'].search_fetch([('campaign_id', '=', self.id), ('res_id', 'in', res_ids)], ['res_id'])
        missing_ids = set(res_ids) - set(cards.mapped('res_id'))
        cards += self.env['card.card'].create([{'campaign_id': self.id, 'res_id': missing_id} for missing_id in missing_ids])

        # order based on input
        res_order = dict(zip(res_ids, count()))
        return self.env['card.card'].concat(*sorted(cards, key=lambda card: res_order[card.res_id]))

    def _get_preview_url_from_res_id(self, res_id):
        return self._get_card_path(res_id, 'preview')

    def _get_card_path(self, res_id, suffix):
        self.ensure_one()
        return f'{self.get_base_url()}/cards/{self._origin.id}/{res_id}/{self._generate_card_hash_token(res_id)}/{suffix}'

    # MAIL RENDER

    def _get_card_element_values(self, record, preview_values):
        """Helper to get the right value for each element when rendering."""
        self.ensure_one()
        value_from_role = {}
        default_values = {
            'background': self.card_template_id.default_background
        }
        for element in self.card_element_ids:
            value = element._get_render_value(record)
            if not value and element.card_element_role in default_values:
                value = default_values[element.card_element_role]
            if not value and preview_values and element.card_element_role in preview_values and element.value_type == 'static':
                value = preview_values[element.card_element_role]
            if not value and not record:
                value = element._get_placeholder_value()
            value_from_role[element.card_element_role] = value

        # in qweb t-out of "False" effectively removed the element while '' does not
        # we force everything to '' to be consistent
        return {element: val or '' for element, val in value_from_role.items()}
