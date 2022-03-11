# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class Article(models.Model):
    _inherit = [
        'knowledge.article'
        'website.published.mixin'
    ]
