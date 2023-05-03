# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.http import request, route, Controller
from odoo.tools import groupby


class CatalogController(Controller):

    @route('/sales/catalog/sale_order_lines_info', auth='user', type='json')
    def sale_product_catalog_get_sale_order_lines_info(self, order_id, product_ids):
        """ Returns products information to be shown in the catalog.

        :param int order_id: The sale order, as a `sale.order` id.
        :param list product_ids: The products currently displayed in the product catalog, as a list
                                 of `product.product` ids.
        :rtype: dict
        :return: A dict with the following structure:
            {
                'productId': int
                'quantity': float (optional)
                'price': float
                'readOnly': bool (optional)
            }
        """
        order = request.env['sale.order'].browse(order_id)
        sale_order_line_info = []
        for product, lines in groupby(
            order.order_line.filtered(lambda line: not line.display_type),
            lambda line: line.product_id
        ):
            if (len(lines) > 1):
                price_unit = lines[0].order_id.pricelist_id._get_product_price(
                    product=lines[0].product_id.with_context(
                        **lines[0]._get_product_price_context()
                    ),
                    quantity=1.0,
                    currency=lines[0].order_id.currency_id,
                    date=lines[0].order_id.date_order,
                )
                sale_order_line_info.append(dict(
                    productId=product.id,
                    readOnly=True,
                    price=price_unit,
                ))
            elif(product.id in product_ids):
                quantity = lines[0].product_uom._compute_quantity(
                    lines[0].product_uom_qty, product.uom_id
                )
                price = order.pricelist_id._get_product_price(
                    product=product.with_context(
                        **lines[0]._get_product_price_context()
                    ),
                    quantity=quantity,
                    currency=order.currency_id,
                    date=order.date_order,
                )
                sale_order_line_info.append(dict(
                    productId=product.id,
                    quantity=quantity,
                    price=price,
                ))
                product_ids.remove(product.id)

        return sale_order_line_info + [dict(
            productId=id,
            price=price,
        ) for id, price in order.pricelist_id._get_products_price(
            quantity=1.0,
            products=request.env['product.product'].browse(product_ids),
            currency=order.currency_id,
            date=order.date_order,
        ).items()]

    @route('/sales/catalog/update_sale_order_line_info', auth='user', type='json')
    def sale_product_catalog_update_sale_order_line_info(self, order_id, product_id, quantity):
        """ Update sale order line information on a given sale order for a given product.

        :param int order_id: The sale order, as a `sale.order` id.
        :param int product_id: The product, as a `product.product` id.
        :param float quantity: The quantity selected in the product catalog.
        :return: The unit price price of the product, based on the pricelist of the sale order and
                 the quantity selected.
        :rtype: float
        """
        sol = request.env['sale.order.line'].search([
            ('order_id', '=', order_id), ('product_id', '=', product_id)
        ])
        if quantity > 0 and not sol:
            order = request.env['sale.order'].browse(order_id)
            sol = request.env['sale.order.line'].create({
                'order_id': order.id,
                'product_id': product_id,
                'product_uom_qty': quantity,
                'sequence': ((order.order_line and order.order_line[-1].sequence + 1) or 10),  # put it at the end of the order
            })
        elif quantity != 0 and sol:
            sol.product_uom_qty = quantity
        elif quantity == 0 and sol:
            price_unit = sol.order_id.pricelist_id._get_product_price(
                product=sol.product_id.with_context(
                    **sol._get_product_price_context()
                ),
                quantity=1.0,
                currency=sol.order_id.currency_id,
                date=sol.order_id.date_order,
            )
            if sol.order_id.state in ['draft', 'sent']:
                sol.unlink()
            else:
                sol.product_uom_qty = 0
            return price_unit
        return sol.price_unit
