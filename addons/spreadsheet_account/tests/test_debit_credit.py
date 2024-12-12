# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import date

from odoo import Command
from odoo.tests import tagged
from odoo.addons.account.tests.common import AccountTestInvoicingCommon


def _get_cell_date(year, month=None, day=None, quarter=None):
    assert not (quarter and month)
    assert not day or month
    return {
        'range_type': (
            'day' if day 
            else 'month' if month 
            else 'quarter' if quarter 
            else 'year'
        ),
        'year': year,
        **{'quarter': quarter},
        **{'month': month},
        **{'day': day},
    }


@tagged("post_install", "-at_install")
class SpreadsheetAccountingFunctionsTest(AccountTestInvoicingCommon):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company_data_2 = cls.setup_other_company()

        cls.account_revenue_c1 = cls.env["account.account"].create(
            {
                "company_ids": [Command.link(cls.company_data["company"].id)],
                "name": "spreadsheet revenue Company 1",
                "account_type": "income",
                "code": "sp1234566",
            }
        )

        cls.account_expense_c1 = cls.env["account.account"].create(
            {
                "company_ids": [Command.link(cls.company_data["company"].id)],
                "name": "spreadsheet expense Company 1",
                "account_type": "expense",
                "code": "sp1234577",
            }
        )

        company_2 = cls.company_data_2["company"]
        cls.account_revenue_c2 = cls.env["account.account"].with_company(company_2).create(
            {
                "company_ids": [Command.link(company_2.id)],
                "name": "spreadsheet revenue Company 2",
                "account_type": "income",
                "code": "sp99887755",
            }
        )

        cls.account_expense_c2 = cls.env["account.account"].with_company(company_2).create(
            {
                "company_ids": [Command.link(company_2.id)],
                "name": "spreadsheet expense Company 2",
                "account_type": "expense",
                "code": "sp99887766",
            }
        )

        cls.env["account.move"].create(
            {
                "company_id": cls.company_data["company"].id,
                "move_type": "entry",
                "date": "2022-04-02",
                "line_ids": [
                    Command.create(
                        {
                            "name": "line_debit_c1",
                            "account_id": cls.account_revenue_c1.id,
                            "debit": 500,
                        }
                    ),
                    Command.create(
                        {
                            "name": "line_credit_c1",
                            "account_id": cls.account_expense_c1.id,
                            "credit": 500,
                        },
                    ),
                ],
            }
        )

        cls.env["account.move"].with_company(cls.company_data_2["company"]).create(
            {
                "company_id": cls.company_data_2["company"].id,
                "move_type": "entry",
                "date": "2022-02-02",
                "line_ids": [
                    Command.create(
                        {
                            "name": "line_debit_c2",
                            "account_id": cls.account_revenue_c2.id,
                            "debit": 1500,
                            "company_id": cls.company_data_2["company"].id,
                        },
                    ),
                    Command.create(
                        {
                            "name": "line_credit_c2",
                            "account_id": cls.account_expense_c2.id,
                            "credit": 1500,
                            "company_id": cls.company_data_2["company"].id,
                        },
                    ),
                ],
            }
        )
    
    def test_pre_process_date_period_boundaries(self):
        expense_account = self.account_expense_c1
        income_account = self.account_revenue_c1
        receivable_account = self.company_data['default_account_receivable']
        cells = [
            {
                'codes': [expense_account.code, income_account.code],
                'date_range': _get_cell_date(2022),
                'company_id': None,
            },
            {
                'codes': [expense_account.code, receivable_account.code],
                'date_range': _get_cell_date(2022),
                'company_id': None,
            },
        ]

        self.env['account.account']._pre_process_date_period_boundaries(cells, {self.env.company.id: expense_account + income_account + receivable_account})

        self.assertEqual(cells[0]['date_from_boundary'], date(2022, 1, 1))
        self.assertEqual(cells[0]['date_to_boundary'], date(2022, 12, 31))
        self.assertFalse(cells[0]['needs_initial_balance'])

        self.assertEqual(cells[1]['date_from_boundary'], date(2022, 1, 1))
        self.assertEqual(cells[1]['date_to_boundary'], date(2022, 12, 31))
        self.assertTrue(cells[1]['needs_initial_balance'])

    def test_get_timeline_same_start_different_finish(self):
        cells = [
            {
                'codes': [self.account_expense_c1.code],
                'date_range': _get_cell_date(2021, quarter=2),
                'company_id': None,
            },
            {
                'codes': [self.account_expense_c1.code],
                'date_range': _get_cell_date(2021, 4),
                'company_id': None,
            },
        ]
        self.env['account.account']._pre_process_date_period_boundaries(cells, {self.env.company.id: self.account_expense_c1})
        timeline = self.env['account.account']._get_timeline(cells)
        self.assertListEqual(timeline, [
            (date(2021, 4, 1), date(2021, 4, 30)),
            (date(2021, 5, 1), date(2021, 6, 30)),
        ])

    def test_get_timeline_same_start_different_finish_in_broader_period(self):
        cells = [
            {
                'codes': [self.account_expense_c1.code],
                'date_range': _get_cell_date(2021),
                'company_id': None,
            },
            {
                'codes': [self.account_expense_c1.code],
                'date_range': _get_cell_date(2021, quarter=2),
                'company_id': None,
            },
            {
                'codes': [self.account_expense_c1.code],
                'date_range': _get_cell_date(2021, 4),
                'company_id': None,
            },
        ]
        self.env['account.account']._pre_process_date_period_boundaries(cells, {self.env.company.id: self.account_expense_c1})
        timeline = self.env['account.account']._get_timeline(cells)
        self.assertListEqual(timeline, [
            (date(2021, 1, 1), date(2021, 3, 31)),
            (date(2021, 4, 1), date(2021, 4, 30)),
            (date(2021, 5, 1), date(2021, 6, 30)),
            (date(2021, 7, 1), date(2021, 12, 31)),
        ])

    def test_get_timeline_different_start_same_finish(self):
        cells = [
            {
                'codes': [self.account_expense_c1.code],
                'date_range': _get_cell_date(2021, quarter=2),
                'company_id': None,
            },
            {
                'codes': [self.account_expense_c1.code],
                'date_range': _get_cell_date(2021, 6),
                'company_id': None,
            },
        ]
        self.env['account.account']._pre_process_date_period_boundaries(cells, {self.env.company.id: self.account_expense_c1})
        timeline = self.env['account.account']._get_timeline(cells)
        self.assertListEqual(timeline, [
            (date(2021, 4, 1), date(2021, 5, 31)),
            (date(2021, 6, 1), date(2021, 6, 30)),
        ])

    def test_get_timeline_different_start_same_finish_in_broader_period(self):
        cells = [
            {
                'codes': [self.account_expense_c1.code],
                'date_range': _get_cell_date(2021, quarter=2),
                'company_id': None,
            },
            {
                'codes': [self.account_expense_c1.code],
                'date_range': _get_cell_date(2021, 6),
                'company_id': None,
            },
            {
                'codes': [self.account_expense_c1.code],
                'date_range': _get_cell_date(2021),
                'company_id': None,
            },
        ]
        self.env['account.account']._pre_process_date_period_boundaries(cells, {self.env.company.id: self.account_expense_c1})
        timeline = self.env['account.account']._get_timeline(cells)
        self.assertListEqual(timeline, [
            (date(2021, 1, 1), date(2021, 3, 31)),
            (date(2021, 4, 1), date(2021, 5, 31)),
            (date(2021, 6, 1), date(2021, 6, 30)),
            (date(2021, 7, 1), date(2021, 12, 31)),
        ])

    def test_get_timeline_following_periods(self):
        cells = [
            {
                'codes': [self.account_expense_c1.code],
                'date_range': _get_cell_date(2022, quarter=2),
                'company_id': None,
            },
            {
                'codes': [self.account_expense_c1.code],
                'date_range': _get_cell_date(2022, quarter=3),
                'company_id': None,
            },
        ]
        self.env['account.account']._pre_process_date_period_boundaries(cells, {self.env.company.id: self.account_expense_c1})
        timeline = self.env['account.account']._get_timeline(cells)
        self.assertListEqual(timeline, [
            (date(2022, 4, 1), date(2022, 6, 30)),
            (date(2022, 7, 1), date(2022, 9, 30)),
        ])
    
    def test_get_timeline_following_periods_in_broader_period(self):
        cells = [
            {
                'codes': [self.account_expense_c1.code],
                'date_range': _get_cell_date(2022, quarter=2),
                'company_id': None,
            },
            {
                'codes': [self.account_expense_c1.code],
                'date_range': _get_cell_date(2022, quarter=3),
                'company_id': None,
            },
            {
                'codes': [self.account_expense_c1.code],
                'date_range': _get_cell_date(2022),
                'company_id': None,
            },
        ]
        self.env['account.account']._pre_process_date_period_boundaries(cells, {self.env.company.id: self.account_expense_c1})
        timeline = self.env['account.account']._get_timeline(cells)
        self.assertListEqual(timeline, [
            (date(2022, 1, 1), date(2022, 3, 31)),
            (date(2022, 4, 1), date(2022, 6, 30)),
            (date(2022, 7, 1), date(2022, 9, 30)),
            (date(2022, 10, 1), date(2022, 12, 31)),
        ])
    
    def test_get_timeline_gapped_periods(self):
        cells = [
            {
                'codes': [self.account_expense_c1.code],
                'date_range': _get_cell_date(2022),
                'company_id': None,
            },
            {
                'codes': [self.account_expense_c1.code],
                'date_range': _get_cell_date(2024),
                'company_id': None,
            }
        ]
        self.env['account.account']._pre_process_date_period_boundaries(cells, {self.env.company.id: self.account_expense_c1})
        timeline = self.env['account.account']._get_timeline(cells)
        self.assertListEqual(timeline, [
            (date(2022, 1, 1), date(2022, 12, 31)),
            (date(2024, 1, 1), date(2024, 12, 31)),
        ])

    def test_get_timeline_overlapping_periods(self):
        cells = [
            {
                'codes': [self.account_expense_c1.code],
                'date_range': _get_cell_date(2024),
                'company_id': None,
            },
            {
                'codes': [self.account_expense_c1.code],
                'date_range': _get_cell_date(2024, quarter=4),
                'company_id': None,
            },
            {
                'codes': [self.account_expense_c1.code],
                'date_range': _get_cell_date(2024, 10),
                'company_id': None,
            },
            {
                'codes': [self.account_expense_c1.code],
                'date_range': _get_cell_date(2024, 10, 2),
                'company_id': None,
            }
        ]
        self.env['account.account']._pre_process_date_period_boundaries(cells, {self.env.company.id: self.account_expense_c1})
        timeline = self.env['account.account']._get_timeline(cells)
        self.assertListEqual(timeline, [
            (date(2024, 1, 1), date(2024, 9, 30)),
            (date(2024, 10, 1), date(2024, 10, 2)),
            (date(2024, 10, 3), date(2024, 10, 31)),
            (date(2024, 11, 1), date(2024, 12, 31)),
        ])

    def test_empty_payload(self):
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit([]), []
        )

    def test_exact_code(self):
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "year",
                            "year": 2022,
                        },
                        "codes": [self.account_revenue_c1.code],
                        "company_id": None,
                        "include_unposted": True,
                    }
                ]
            ),
            [{"credit": 0.0, "debit": 500.0}],
        )

    def test_two_codes(self):
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "year",
                            "year": 2022,
                        },
                        "codes": [self.account_revenue_c1.code, self.account_expense_c1.code],
                        "company_id": None,
                        "include_unposted": True,
                    }
                ]
            ),
            [{"credit": 500, "debit": 500.0}],
        )

    def test_two_codes_mixing_balance(self):
        self.account_revenue_c1.sudo().account_type = 'asset_receivable'
        self.env["account.move"].create(
            {
                "company_id": self.company_data["company"].id,
                "move_type": "entry",
                "date": "2000-07-02",
                "line_ids": [
                    Command.create(
                        {
                            "name": "line_debit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "debit": 555,
                        },
                    ),
                    Command.create(
                        {
                            "name": "line_credit_c1",
                            "account_id": self.account_expense_c1.id,
                            # not taken into account because the account
                            # has include_initial_balance=False
                            "credit": 555,
                        },
                    ),
                ],
            }
        )
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "year",
                            "year": 2022,
                        },
                        "codes": [self.account_revenue_c1.code, self.account_expense_c1.code],
                        "company_id": None,
                        "include_unposted": True,
                    }
                ]
            ),
            [{"credit": 500, "debit": 1055.0}],
        )

    def test_response_order(self):
        request_1 = {
            "date_range": {
                "range_type": "year",
                "year": 2022,
            },
            "codes": [self.account_revenue_c1.code],
            "company_id": None,
            "include_unposted": True,
        }
        request_2 = {
            "date_range": {
                "range_type": "year",
                "year": 2020,
            },
            "codes": [self.account_revenue_c1.code],
            "company_id": None,
            "include_unposted": True,
        }
        [o1_res1, o1_res2] = self.env["account.account"].spreadsheet_fetch_debit_credit(
            [request_1, request_2]
        )
        [o2_res2, o2_res1] = self.env["account.account"].spreadsheet_fetch_debit_credit(
            [request_2, request_1]
        )
        self.assertEqual(o1_res1, o2_res1)
        self.assertEqual(o1_res2, o2_res2)

    def test_prefix_code(self):
        code = "sp1234"
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "year",
                            "year": 2022,
                        },
                        "codes": [code],
                        "company_id": None,
                        "include_unposted": True,
                    }
                ]
            ),
            [
                {"credit": 500.0, "debit": 500.0},
            ],
        )

    def test_duplicated_prefix_code(self):
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "year",
                            "year": 2022,
                        },
                        "codes": ["sp1234", "sp1234"],
                        "company_id": None,
                        "include_unposted": True,
                    }
                ]
            ),
            [
                {"credit": 500.0, "debit": 500.0},
            ],
        )

    def test_company_not_in_env(self):
        Account = self.env["account.account"].with_company(self.company_data["company"].id)
        self.assertEqual(
            Account.spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "year",
                            "year": 2022,
                        },
                        "codes": ["sp1234566"],  # only for company 1
                        "company_id": self.company_data["company"].id,
                        "include_unposted": True,
                    },
                    {
                        "date_range": {
                            "range_type": "year",
                            "year": 2022,
                        },
                        "codes": ["sp99887755"],  # only for company 2
                        "company_id": self.company_data_2["company"].id,
                        "include_unposted": True,
                    },
                ]
            ),
            [
                {"credit": 0, "debit": 500.0},
                {"credit": 0, "debit": 1500.0},
            ],
        )

    def test_do_not_count_future_years(self):
        self.env["account.move"].create(
            {
                "company_id": self.company_data["company"].id,
                "move_type": "entry",
                "date": "2022-04-02",
                "line_ids": [
                    Command.create(
                        {
                            "name": "line_debit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "debit": 1000,
                        },
                    ),
                    Command.create(
                        {
                            "name": "line_credit_c1",
                            "account_id": self.account_expense_c1.id,
                            "credit": 1000,
                        },
                    ),
                ],
            }
        )
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "year",
                            "year": 2021,
                        },
                        "codes": [self.account_revenue_c1.code],
                        "company_id": None,
                        "include_unposted": True,
                    }
                ]
            ),
            [
                {"credit": 0, "debit": 0.0},
            ],
        )

    def test_year_date_period(self):
        self.env["account.move"].create(
            {
                "company_id": self.company_data["company"].id,
                "move_type": "entry",
                "date": "2020-04-02",
                "line_ids": [
                    Command.create(
                        {
                            "name": "line_debit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "debit": 1000,
                        },
                    ),
                    Command.create(
                        {
                            "name": "line_credit_c1",
                            "account_id": self.account_expense_c1.id,
                            "credit": 1000,
                        },
                    ),
                ],
            }
        )
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "year",
                            "year": 2021,
                        },
                        "codes": [self.account_revenue_c1.code],
                        "company_id": None,
                        "include_unposted": True,
                    }
                ]
            ),
            [
                {"credit": 0, "debit": 0.0},
            ],
        )

    def test_shifted_fiscal_year_date_period(self):
        self.company_data["company"].fiscalyear_last_day = 3
        self.company_data["company"].fiscalyear_last_month = "2"
        self.env["account.move"].create(
            {
                "company_id": self.company_data["company"].id,
                "move_type": "entry",
                "date": "2023-01-02",
                "line_ids": [
                    Command.create(
                        {
                            "name": "line_debit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "debit": 1000,
                        },
                    ),
                    Command.create(
                        {
                            "name": "line_credit_c1",
                            "account_id": self.account_expense_c1.id,
                            "credit": 1000,
                        },
                    ),
                ],
            }
        )
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "year",
                            "year": 2022,
                        },
                        "codes": [self.account_revenue_c1.code],
                        "company_id": None,
                        "include_unposted": True,
                    }
                ]
            ),
            [{"credit": 0, "debit": 1500.0}],
        )

    def test_quarter_date_period(self):
        self.env["account.move"].create(
            {
                "company_id": self.company_data["company"].id,
                "move_type": "entry",
                "date": "2022-07-02",
                "line_ids": [
                    Command.create(
                        {
                            "name": "line_debit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "debit": 777,
                        },
                    ),
                    Command.create(
                        {
                            "name": "line_credit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "credit": 777,
                        },
                    ),
                ],
            }
        )
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "quarter",
                            "year": 2022,
                            "quarter": 3,
                        },
                        "codes": [self.account_revenue_c1.code],
                        "company_id": None,
                        "include_unposted": True,
                    }
                ]
            ),
            [{"credit": 777, "debit": 777}],
        )

    def test_month_date_period(self):
        self.env["account.move"].create(
            {
                "company_id": self.company_data["company"].id,
                "move_type": "entry",
                "date": "2022-07-02",
                "line_ids": [
                    Command.create(
                        {
                            "name": "line_debit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "debit": 666,
                        },
                    ),
                    Command.create(
                        {
                            "name": "line_credit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "credit": 666,
                        },
                    ),
                ],
            }
        )
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {"range_type": "month", "year": 2022, "month": 7},
                        "codes": [self.account_revenue_c1.code],
                        "company_id": None,
                        "include_unposted": True,
                    }
                ]
            ),
            [{"credit": 666, "debit": 666}],
        )

    def test_day_date_period(self):
        self.env["account.move"].create(
            {
                "company_id": self.company_data["company"].id,
                "move_type": "entry",
                "date": "2022-07-02",
                "line_ids": [
                    Command.create(
                        {
                            "name": "line_debit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "debit": 555,
                        },
                    ),
                    Command.create(
                        {
                            "name": "line_credit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "credit": 555,
                        },
                    ),
                ],
            }
        )
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "day",
                            "year": 2022,
                            "month": 7,
                            "day": 2,
                        },
                        "codes": [self.account_revenue_c1.code],
                        "company_id": None,
                        "include_unposted": True,
                    }
                ]
            ),
            [{"credit": 555, "debit": 1055}],
        )

    def test_first_fiscal_day_date_period(self):
        self.company_data["company"].fiscalyear_last_day = 3
        self.company_data["company"].fiscalyear_last_month = "2"
        self.env["account.move"].create(
            {
                "company_id": self.company_data["company"].id,
                "move_type": "entry",
                "date": "2022-02-03",
                "line_ids": [
                    Command.create(
                        {
                            "name": "line_debit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "debit": 111,
                        },
                    ),
                    Command.create(
                        {
                            "name": "line_credit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "credit": 111,
                        },
                    ),
                ],
            }
        )
        self.env["account.move"].create(
            {
                "company_id": self.company_data["company"].id,
                "move_type": "entry",
                "date": "2022-02-04",
                "line_ids": [
                    Command.create(
                        {
                            "name": "line_debit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "debit": 423,
                        },
                    ),
                    Command.create(
                        {
                            "name": "line_credit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "credit": 423,
                        },
                    ),
                ],
            }
        )
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "day",
                            "year": 2022,
                            "month": 2,
                            "day": 4,
                        },
                        "codes": [self.account_revenue_c1.code],
                        "company_id": None,
                        "include_unposted": True,
                    }
                ]
            ),
            [
                {"credit": 423, "debit": 423},
            ],
        )

    def test_balance_account_by_year(self):
        # On balance accounts, we sum the lines from the creation up to the last dat of date_range
        self.account_revenue_c1.sudo().account_type = 'asset_receivable'
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "year",
                            "year": 2025,
                        },
                        "codes": [self.account_revenue_c1.code],
                        "company_id": None,
                        "include_unposted": True,
                    }
                ]
            ),
            [
                {"credit": 0, "debit": 500},
            ],
        )

    def test_balance_quarter_date_period(self):
        self.account_revenue_c1.sudo().account_type = 'asset_receivable'
        self.env["account.move"].create(
            {
                "company_id": self.company_data["company"].id,
                "move_type": "entry",
                "date": "2022-07-02",
                "line_ids": [
                    Command.create(
                        {
                            "name": "line_debit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "debit": 777,
                        },
                    ),
                    Command.create(
                        {
                            "name": "line_credit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "credit": 777,
                        },
                    ),
                ],
            }
        )
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "quarter",
                            "year": 2022,
                            "quarter": 3,
                        },
                        "codes": [self.account_revenue_c1.code],
                        "company_id": None,
                        "include_unposted": True,
                    }
                ]
            ),
            [
                {"credit": 777, "debit": 1277},
            ],
        )

    def test_balance_month_date_period(self):
        self.account_revenue_c1.sudo().account_type = 'asset_receivable'
        self.env["account.move"].create(
            {
                "company_id": self.company_data["company"].id,
                "move_type": "entry",
                "date": "2022-07-02",
                "line_ids": [
                    Command.create(
                        {
                            "name": "line_debit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "debit": 777,
                        },
                    ),
                    Command.create(
                        {
                            "name": "line_credit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "credit": 777,
                        },
                    ),
                ],
            }
        )
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {"range_type": "month", "year": 2022, "month": 7},
                        "codes": [self.account_revenue_c1.code],
                        "company_id": None,
                        "include_unposted": True,
                    }
                ]
            ),
            [
                {"credit": 777, "debit": 1277},
            ],
        )

    def test_balance_day_date_period(self):
        self.account_revenue_c1.sudo().account_type = 'asset_receivable'
        self.env["account.move"].create(
            {
                "company_id": self.company_data["company"].id,
                "move_type": "entry",
                "date": "2022-07-02",
                "line_ids": [
                    Command.create(
                        {
                            "name": "line_debit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "debit": 777,
                        },
                    ),
                    Command.create(
                        {
                            "name": "line_credit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "credit": 777,
                        },
                    ),
                ],
            }
        )
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "day",
                            "year": 2022,
                            "month": 7,
                            "day": 2,
                        },
                        "codes": [self.account_revenue_c1.code],
                        "company_id": None,
                        "include_unposted": True,
                    }
                ]
            ),
            [
                {"credit": 777, "debit": 1277},
            ],
        )

    def test_move_state_ignore_cancel(self):
        self.account_revenue_c1.sudo().account_type = 'asset_receivable'
        self.env["account.move"].create(
            {
                "company_id": self.company_data["company"].id,
                "move_type": "entry",
                "date": "2022-04-02",
                "state": "cancel",
                "line_ids": [
                    Command.create(
                        {
                            "name": "line_debit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "debit": 10000000,
                        },
                    ),
                    Command.create(
                        {
                            "name": "line_credit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "credit": 10000000,
                        },
                    ),
                ],
            }
        )
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "year",
                            "year": 2022,
                        },
                        "codes": [self.account_revenue_c1.code],
                        "company_id": None,
                        "include_unposted": False,
                    }
                ]
            ),
            [
                {"credit": 0, "debit": 0},
            ],
        )
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "year",
                            "year": 2022,
                        },
                        "codes": [self.account_revenue_c1.code],
                        "company_id": None,
                        "include_unposted": True,
                    }
                ]
            ),
            [
                {"credit": 0, "debit": 500},
            ],
        )

    def test_move_state_unposted(self):
        self.account_revenue_c1.sudo().account_type = 'asset_receivable'
        move = self.env["account.move"].create(
            {
                "company_id": self.company_data["company"].id,
                "move_type": "entry",
                "date": "2022-04-02",
                "line_ids": [
                    Command.create(
                        {
                            "name": "line_debit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "debit": 888,
                        },
                    ),
                    Command.create(
                        {
                            "name": "line_credit_c1",
                            "account_id": self.account_revenue_c1.id,
                            "credit": 888,
                        },
                    ),
                ],
            }
        )
        move._post()
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "year",
                            "year": 2022,
                        },
                        "codes": [self.account_revenue_c1.code],
                        "company_id": None,
                        "include_unposted": False,
                    }
                ]
            ),
            [
                {"credit": 888, "debit": 888},
            ],
        )
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "year",
                            "year": 2022,
                        },
                        "codes": [self.account_revenue_c1.code],
                        "company_id": None,
                        "include_unposted": True,
                    }
                ]
            ),
            [
                {"credit": 888, "debit": 1388},
            ],
        )

    def test_empty_code(self):
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "year",
                            "year": 2022,
                        },
                        "codes": [""],
                        "company_id": None,
                        "include_unposted": False,
                    }
                ]
            ),
            [
                {"credit": 0, "debit": 0},
            ],
        )

    def test_code_no_account(self):
        """code that doesn't match any account"""
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "year",
                            "year": 2022,
                        },
                        "codes": ["10000000000"],
                        "company_id": None,
                        "include_unposted": False,
                    }
                ]
            ),
            [
                {"credit": 0, "debit": 0},
            ],
        )

    def test_no_code(self):
        self.assertEqual(
            self.env["account.account"].spreadsheet_fetch_debit_credit(
                [
                    {
                        "date_range": {
                            "range_type": "year",
                            "year": 2022,
                        },
                        "codes": [],
                        "company_id": None,
                        "include_unposted": False,
                    }
                ]
            ),
            [
                {"credit": 0, "debit": 0},
            ],
        )

    def test_see_records_action(self):
        action = self.env["account.account"].spreadsheet_move_line_action(
            {
                "date_range": {
                    "range_type": "year",
                    "year": 2022,
                },
                "codes": [self.account_revenue_c1.code],
                "company_id": self.account_revenue_c1.company_ids.id,
                "include_unposted": True,
            }
        )
        self.assertEqual(
            action,
            {
                "type": "ir.actions.act_window",
                "res_model": "account.move.line",
                "view_mode": "list",
                "views": [[False, "list"]],
                "target": "current",
                "domain": [
                    "&",
                    "&",
                    "&",
                    ("account_id", "in", [self.account_revenue_c1.id]),
                    "|",
                    "&",
                    ("account_id.include_initial_balance", "=", True),
                    ("date", "<=", date(2022, 12, 31)),
                    "&",
                    "&",
                    ("account_id.include_initial_balance", "=", False),
                    ("date", ">=", date(2022, 1, 1)),
                    ("date", "<=", date(2022, 12, 31)),
                    ("company_id", "=", self.account_revenue_c1.company_ids.id),
                    ("move_id.state", "!=", "cancel"),
                ],
                "name": "Cell Audit",
            },
        )

    def test_see_records_action_no_code(self):
        action = self.env["account.account"].spreadsheet_move_line_action(
            {
                "date_range": {
                    "range_type": "year",
                    "year": 2022,
                },
                "codes": [""],
                "company_id": None,
                "include_unposted": True,
            }
        )
        self.assertEqual(
            action,
            {
                "type": "ir.actions.act_window",
                "res_model": "account.move.line",
                "view_mode": "list",
                "views": [[False, "list"]],
                "target": "current",
                "domain": [(0, "=", 1)],
                "name": "Cell Audit",
            },
        )
