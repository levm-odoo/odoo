from markupsafe import Markup

from odoo import models, _


class StockRule(models.Model):
    _inherit = 'stock.rule'

    def _notify_responsible(self, procurement):
        origin_orders = procurement.values.get('group_id').mrp_production_ids if procurement.values.get('group_id') else False
        if origin_orders:
            notified_users = procurement.product_id.responsible_id.partner_id | origin_orders.user_id.partner_id
            notification_msg = Markup(" ").join(Markup("%s") % user._get_html_link(f'@{user.display_name}') for user in notified_users)
            notification_msg += Markup("<br/>%s <strong>%s</strong>, %s") % (_("No supplier has been found to replenish"), procurement.product_id.display_name, _("this product should be manually replenished."))
            origin_orders.message_post(body=notification_msg, partner_ids=notified_users.ids)
