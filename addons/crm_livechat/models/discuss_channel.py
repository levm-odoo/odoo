# Part of Odoo. See LICENSE file for full copyright and licensing details.

from markupsafe import Markup

from odoo import fields, models, _
from odoo.tools import html2plaintext


class DiscussChannel(models.Model):
    _inherit = 'discuss.channel'

    has_crm_lead = fields.Boolean(
        compute="_compute_has_crm_lead",
        search="_search_has_crm_lead",
        groups="sales_team.group_sale_salesman",
    )

    def _compute_has_crm_lead(self):
        channels_with_lead = self.env["crm.lead"]._read_group(
            [("channel_id", "in", self.ids)], aggregates=["channel_id:recordset"]
        )[0][0]
        for channel in self:
            channel.has_crm_lead = channel in channels_with_lead

    def _search_has_crm_lead(self, operator, operand):
        is_in = (operator == "=" and operand) or (operator == "!=" and not operand)
        channel_ids = (
            self.env["crm.lead"]
            ._read_group([("channel_id", "!=", False)], aggregates=["channel_id:recordset"])[0][0]
            .ids
        )
        return [('id', "in" if is_in else "not in", channel_ids)]

    def execute_command_lead(self, **kwargs):
        key = kwargs['body']
        lead_command = "/lead"
        if key.strip() == lead_command:
            msg = _(
                "Create a new lead: "
                "%(pre_start)s%(lead_command)s %(i_start)slead title%(i_end)s%(pre_end)s",
                lead_command=lead_command,
                pre_start=Markup("<pre>"),
                pre_end=Markup("</pre>"),
                i_start=Markup("<i>"),
                i_end=Markup("</i>"),
            )
        else:
            lead = self._convert_visitor_to_lead(self.env.user.partner_id, key)
            msg = _("Created a new lead: %s", lead._get_html_link())
        self.env.user._bus_send_transient_message(self, msg)

    def _convert_visitor_to_lead(self, partner, key):
        """ Create a lead from channel /lead command
        :param partner: internal user partner (operator) that created the lead;
        :param key: operator input in chat ('/lead Lead about Product')
        """
        # if public user is part of the chat: consider lead to be linked to an
        # anonymous user whatever the participants. Otherwise keep only share
        # partners (no user or portal user) to link to the lead.
        customers = self.env['res.partner']
        for customer in self.with_context(active_test=False).channel_partner_ids.filtered(lambda p: p != partner and p.partner_share):
            if customer.is_public:
                customers = self.env['res.partner']
                break
            else:
                customers |= customer

        utm_source = self.env.ref('crm_livechat.utm_source_livechat', raise_if_not_found=False)
        return self.env['crm.lead'].create({
            'name': html2plaintext(key[5:]),
            'partner_id': customers[0].id if customers else False,
            'user_id': False,
            'team_id': False,
            'description': self._get_channel_history(),
            'referred': partner.name,
            'source_id': utm_source and utm_source.id,
        })
