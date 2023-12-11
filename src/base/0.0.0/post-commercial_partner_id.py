# -*- coding: utf-8 -*-
from odoo.addons.base.maintenance.migrations import util


def migrate(cr, version):
    # The `commercial_partner_id` field is expected to always be set. Although the column is not marked as `NOT NULL`.
    # Fight the Murphy's Law, and recompute the value on partners with a NULL value.
    util.explode_execute(
        cr,
        """
        UPDATE res_partner
           SET commercial_partner_id = id
         WHERE commercial_partner_id IS NULL
           AND ( is_company = 't'
                OR parent_id IS NULL)
        """,
        table="res_partner",
    )
    cr.execute("SELECT id FROM res_partner WHERE commercial_partner_id IS NULL")
    if cr.rowcount:
        util.recompute_fields(
            cr, "res.partner", ["commercial_partner_id"], ids=[id_ for id_, in cr.fetchall()], strategy="commit"
        )
