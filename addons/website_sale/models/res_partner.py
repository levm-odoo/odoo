# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import _, api, fields, models
from odoo.http import request

from odoo.addons.website.models import ir_http
from odoo.addons.website_sale import const


class ResPartner(models.Model):
    _inherit = 'res.partner'

    last_website_so_id = fields.Many2one(
        string="Last Online Sales Order",
        comodel_name='sale.order',
        compute='_compute_last_website_so_id',
    )

    def _compute_last_website_so_id(self):
        SaleOrder = self.env['sale.order']
        for partner in self:
            is_public = partner.is_public
            website = ir_http.get_request_website()
            if website and not is_public:
                partner.last_website_so_id = SaleOrder.search([
                    ('partner_id', '=', partner.id),
                    ('pricelist_id', '=', partner.property_product_pricelist.id),
                    ('website_id', '=', website.id),
                    ('state', '=', 'draft'),
                ], order='write_date desc', limit=1)
            else:
                partner.last_website_so_id = SaleOrder  # Not in a website context or public User

    @api.onchange('property_product_pricelist')
    def _onchange_property_product_pricelist(self):
        open_order = self.env['sale.order'].sudo().search([
            ('partner_id', '=', self._origin.id),
            ('pricelist_id', '=', self._origin.property_product_pricelist.id),
            ('pricelist_id', '!=', self.property_product_pricelist.id),
            ('website_id', '!=', False),
            ('state', '=', 'draft'),
        ], limit=1)

        if open_order:
            return {'warning': {
                'title': _('Open Sale Orders'),
                'message': _(
                    "This partner has an open cart. "
                    "Please note that the pricelist will not be updated on that cart. "
                    "Also, the cart might not be visible for the customer until you update the pricelist of that cart."
                ),
            }}

    def _get_current_partner(self, order_sudo=False, **kwargs):
        if order_sudo:
            return order_sudo.partner_id
        return super()._get_current_partner(order_sudo=order_sudo, **kwargs)

    def _is_anonymous_customer(self):
        """ Override `portal` to check if customer is anonymous or not by comparing
        customer with website public user partner if same then customer is anonymous.

        :return: Whether the customer is anonymous or not.
        :rtype: bool
        """
        return (
            super()._is_anonymous_customer()
            or self == request.website.user_id.sudo().partner_id
        )

    def _display_b2b_fields(self, country_code):
        """ This method is to check whether address form should display b2b fields. """
        return (
            request.website.is_view_active('website_sale.address_b2b')
            or country_code in const.DISPLAY_B2B_FIELDS_COUNTRY_CODE
        )
