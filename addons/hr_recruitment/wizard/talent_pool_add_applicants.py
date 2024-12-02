from odoo import fields, models, Command


class TalentPoolAddApplicants(models.TransientModel):
    _name = "talent.pool.add.applicants"
    _description = "Add applicants to talent pool"
    applicant_ids = fields.Many2many(
        "hr.applicant",
        string="Applicants",
        required=True,
        domain=[
            "|",
            ("talent_pool_ids", "!=", False),
            ("applicant_is_in_pool", "=", False),
        ],
    )
    talent_pool_ids = fields.Many2many("hr.talent.pool", string="Talent Pool")
    categ_ids = fields.Many2many(
        "hr.applicant.category",
        string="Tags",
    )

    def action_add_applicants_to_pool(self):
        new_applicant = self.env["hr.applicant"]
        for applicant in self.applicant_ids:
            if applicant.talent_pool_ids:
                applicant.write(
                    {
                        "talent_pool_ids": [
                            Command.link(talent_pool.id)
                            for talent_pool in self.talent_pool_ids
                        ],
                        "categ_ids": [
                            Command.link(categ.id)
                            for categ in self.categ_ids
                        ]
                    }
                )
                new_applicant = applicant
            else:
                new_applicant = applicant.copy(
                    {
                        "job_id": False,
                        "talent_pool_ids": self.talent_pool_ids,
                        "categ_ids": applicant.categ_ids + self.categ_ids,
                    }
                )
                new_applicant.write({"pool_applicant_id": new_applicant.id})
                applicant.write({"pool_applicant_id": new_applicant.id})

        if len(self.applicant_ids) == 1:
            return {
                "type": "ir.actions.act_window",
                "res_model": "hr.applicant",
                "view_mode": "form",
                "views": [
                    (
                        self.env.ref("hr_recruitment.hr_applicant_view_form").id,
                        "form",
                    )
                ],
                "target": "current",
                "res_id": new_applicant.id,
            }
