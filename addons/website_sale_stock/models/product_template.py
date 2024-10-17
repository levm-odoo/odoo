# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models
from odoo.http import request
from odoo.tools.translate import html_translate

from odoo.addons.website.models import ir_http


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    allow_out_of_stock_order = fields.Boolean(string='Continue selling when out-of-stock', default=True)

    available_threshold = fields.Float(string='Show Threshold', default=5.0)
    show_availability = fields.Boolean(string='Show availability Qty', default=False)
    out_of_stock_message = fields.Html(string="Out-of-Stock Message", translate=html_translate)

    def _is_sold_out(self):
        return self.is_storable and self.product_variant_id._is_sold_out()

    def _website_show_quick_add(self):
        return (
            super()._website_show_quick_add()
            and (self.allow_out_of_stock_order or not self._is_sold_out())
        )

    def _get_additionnal_combination_info(self, product_or_template, quantity, date, website):
        res = super()._get_additionnal_combination_info(product_or_template, quantity, date, website)

        if not self.env.context.get('website_sale_stock_get_quantity'):
            return res

        if not product_or_template.is_storable:
            return res

        res.update({
            'is_storable': True,
            'allow_out_of_stock_order': product_or_template.allow_out_of_stock_order,
            'available_threshold': product_or_template.available_threshold,
        })
        if product_or_template.is_product_variant:
            product_sudo = product_or_template.sudo()
            free_qty = website._get_product_available_qty(product_sudo)
            has_stock_notification = (
                product_sudo._has_stock_notification(self.env.user.partner_id)
                or request and product_sudo.id in request.session.get(
                    'product_with_stock_notification_enabled', set())
            )
            stock_notification_email = request and request.session.get('stock_notification_email', '')
            precision_digits = self.env['decimal.precision'].precision_get('Product Unit of Measure')
            res.update({
                'free_qty': free_qty,
                'cart_qty': product_sudo._get_cart_qty(website),
                'uom_name': product_sudo.uom_id.name,
                'uom_rounding': 10 ** -precision_digits,
                'show_availability': product_sudo.show_availability,
                'out_of_stock_message': product_sudo.out_of_stock_message,
                'has_stock_notification': has_stock_notification,
                'stock_notification_email': stock_notification_email,
            })
        else:
            res.update({
                'free_qty': 0,
                'cart_qty': 0,
            })

        return res

    @api.model
    def _get_additional_configurator_data(
        self, product_or_template, date, currency, pricelist, **kwargs
    ):
        """ Override of `website_sale` to append stock data.

        :param product.product|product.template product_or_template: The product for which to get
            additional data.
        :param datetime date: The date to use to compute prices.
        :param res.currency currency: The currency to use to compute prices.
        :param product.pricelist pricelist: The pricelist to use to compute prices.
        :param dict kwargs: Locally unused data passed to `super` and `_get_product_available_qty`.
        :rtype: dict
        :return: A dict containing additional data about the specified product.
        """
        data = super()._get_additional_configurator_data(
            product_or_template, date, currency, pricelist, **kwargs
        )

        if (
            (website := ir_http.get_request_website())
            and product_or_template.is_storable
            and not product_or_template.allow_out_of_stock_order
        ):
            available_qty = website._get_product_available_qty(
                product_or_template.sudo(), **kwargs
            ) if product_or_template.is_product_variant else 0
            cart_quantity = product_or_template._get_cart_qty(
                website
            ) if product_or_template.is_product_variant else 0
            data['free_qty'] = available_qty - cart_quantity
        return data
