# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, api, SUPERUSER_ID


class UtmCampaign(models.Model):
    _inherit = ['utm.campaign']
    _description = 'UTM Campaign'

    items_total = fields.Integer(string="Number of items that are part of the campaign", compute="_compute_items_total")
    clicked_total = fields.Integer(string="Number of items that are part of the campaign who generated a click", compute="_compute_items_total")
    clicks_ratio = fields.Integer(string="Global Clicks Ratio for the campaign", compute="_compute_clicks_ratio")
    click_count = fields.Integer(string="Number of clicks", compute="_compute_clicks_count")

    def _compute_clicks_count(self):
        click_data = self.env['link.tracker.click'].read_group(
            [('campaign_id', 'in', self.ids)],
            ['campaign_id'], ['campaign_id'])

        mapped_data = {datum['campaign_id'][0]: datum['campaign_id_count'] for datum in click_data}

        for campaign in self:
            campaign.click_count = mapped_data.get(campaign.id, 0)

    def _compute_items_total(self):
        """Empty method that will be implemented by inheriting classes"""
        return

    @api.depends('items_total', 'clicked_total')
    def _compute_clicks_ratio(self):
        for campaign in self:
            campaign.clicks_ratio = campaign.clicked_total / campaign.items_total * 100 if campaign.items_total > 0 else 0
