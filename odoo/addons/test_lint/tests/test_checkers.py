import json
import os
import tempfile
import unittest
from subprocess import run, PIPE
from textwrap import dedent
import pylint.testutils

from odoo import tools
from odoo.tests.common import TransactionCase

from . import _odoo_checker_sql_injection

try:
    import pylint
except ImportError:
    pylint = None
try:
    pylint_bin = tools.which('pylint')
except IOError:
    pylint_bin = None

HERE = os.path.dirname(os.path.realpath(__file__))
@unittest.skipUnless(pylint and pylint_bin, "testing lints requires pylint")
class TestSqlLint(TransactionCase):
    def check(self, testtext):
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', delete=False) as f:
            self.addCleanup(os.remove, f.name)
            f.write(dedent(testtext).strip())

        result = run(
            [pylint_bin,
             f'--rcfile={os.devnull}',
             '--load-plugins=_odoo_checker_sql_injection',
             '--disable=all',
             '--enable=sql-injection',
             '--output-format=json',
             f.name,
            ],
            check=False,
            stdout=PIPE, encoding='utf-8',
            env={
                **os.environ,
                'PYTHONPATH': HERE+os.pathsep+os.environ.get('PYTHONPATH', ''),
            }
        )
        return result.returncode, json.loads(result.stdout)

    def test_printf(self):
        r, [err] = self.check("""
        def do_the_thing(cr, name):
            cr.execute('select %s from thing' % name)
        """)
        self.assertTrue(r, "should have noticed the injection")
        self.assertEqual(err['line'], 2, err)

        r, errs = self.check("""
        def do_the_thing(self):
            self.env.cr.execute("select thing from %s" % self._table)
        """)
        self.assertFalse(r, f"underscore-attributes are allowed\n{errs}")

        r, errs = self.check("""
        def do_the_thing(self):
            query = "select thing from %s"
            self.env.cr.execute(query % self._table)
        """)
        self.assertFalse(r, f"underscore-attributes are allowed\n{errs}")

    def test_fstring(self):
        r, [err] = self.check("""
        def do_the_thing(cr, name):
            cr.execute(f'select {name} from thing')
        """)
        self.assertTrue(r, "should have noticed the injection")
        self.assertEqual(err['line'], 2, err)

        r, errs = self.check("""
        def do_the_thing(cr, name):
            cr.execute(f'select name from thing')
        """)
        self.assertFalse(r, f"unnecessary fstring should be innocuous\n{errs}")

        r, errs = self.check("""
        def do_the_thing(cr, name, value):
            cr.execute(f'select {name} from thing where field = %s', [value])
        """)
        self.assertFalse(r, f"probably has a good reason for the extra arg\n{errs}")

        r, errs = self.check("""
        def do_the_thing(self):
            self.env.cr.execute(f'select name from {self._table}')
        """)
        self.assertFalse(r, f'underscore-attributes are allowable\n{errs}')
    def test_sql_injection_detection(self):
        checker_test_object = pylint.testutils.CheckerTestCase()
        checker_test_object.CHECKER_CLASS = (_odoo_checker_sql_injection.OdooBaseChecker)
        checker_test_object.setup_method()
        checker_test_object.checker.linter.current_file = 'not_test_checkers.py'
        node = _odoo_checker_sql_injection.astroid.extract_node("""
        def get_parner(self,arg):
            my_injection_variable= "aaa" % arg #Uninferable
            self.env.cr.execute('select * from hello where id = %s' % my_injection_variable) #@
        """)
        with checker_test_object.assertAddsMessages(
            pylint.testutils.MessageTest(
                msg_id="sql-injection",
                node=node,
                line=4,
                col_offset=4,
                end_line=4,
                end_col_offset=84,
            ),
        ): checker_test_object.checker.visit_call(node) 

        node = _odoo_checker_sql_injection.astroid.extract_node("""
        def get_parner(self):
            my_injection_variable= "aaa" + "aaa" #Const
            self.env.cr.execute('select * from hello where id = %s' % my_injection_variable) #@
        """)
        with checker_test_object.assertNoMessages(): checker_test_object.checker.visit_call(node) 

        node = _odoo_checker_sql_injection.astroid.extract_node("""
        def get_parner(self, arg):
            my_injection_variable= "aaaaaaaa" + arg #Uninferable
            self.env.cr.execute('select * from hello where id = %s' % my_injection_variable) #@
        """)
        with checker_test_object.assertAddsMessages(
            pylint.testutils.MessageTest(
                msg_id="sql-injection",
                node=node,
                line=4,
                col_offset=4,
                end_line=4,
                end_col_offset=84,
            ),
        ): checker_test_object.checker.visit_call(node) 

        node = _odoo_checker_sql_injection.astroid.extract_node("""
        def get_parner(self):
            arg1 = "a"
            arg2 = "b" + arg1
            arg3 = arg2 + arg1 + arg2 
            arg4 = arg1 + "d"
            my_injection_variable= arg1 + arg2 + arg3 + arg4
            self.env.cr.execute('select * from hello where id = %s' % my_injection_variable) #@
        """)

        with checker_test_object.assertNoMessages(): checker_test_object.checker.visit_call(node) 

        node = _odoo_checker_sql_injection.astroid.extract_node("""
        def get_parner(self, arg):
            my_injection_variable= f"aaaaaaaa" #Uninferable
            self.env.cr.execute('select * from hello where id = %s' % my_injection_variable) #@
        """)
        with checker_test_object.assertAddsMessages(
            pylint.testutils.MessageTest(
                msg_id="sql-injection",
                node=node,
                line=4,
                col_offset=4,
                end_line=4,
                end_col_offset=84,
            ),
        ): checker_test_object.checker.visit_call(node) 

        node = _odoo_checker_sql_injection.astroid.extract_node("""
        def get_parner(self, arg):
            my_injection_variable= "aaaaaaaa".format() # Const
            self.env.cr.execute('select * from hello where id = %s' % my_injection_variable) #@
        """)
        with checker_test_object.assertNoMessages(): checker_test_object.checker.visit_call(node) 

        node = _odoo_checker_sql_injection.astroid.extract_node("""
        def get_parner(self, arg):
            my_injection_variable= "aaaaaaaa {test}".format(test="aaa") # Const
            self.env.cr.execute('select * from hello where id = %s' % my_injection_variable) #@
        """)
        with checker_test_object.assertNoMessages(): checker_test_object.checker.visit_call(node) 

        node = _odoo_checker_sql_injection.astroid.extract_node("""
        def get_parner(self, arg):
            my_injection_variable= "aaaaaaaa {test}".format(test=arg) #Uninferable             
            self.env.cr.execute('select * from hello where id = %s' % my_injection_variable) #@
        """)
        with checker_test_object.assertAddsMessages(
            pylint.testutils.MessageTest(
                msg_id="sql-injection",
                node=node,
                line=4,
                col_offset=4,
                end_line=4,
                end_col_offset=84,
            ),
        ): checker_test_object.checker.visit_call(node) 

        node = _odoo_checker_sql_injection.astroid.extract_node("""
        def get_parner(self, arg):
            my_injection_variable= "aaaaaaaa {test}".format(test="aaa" + arg) #Uninferable
            self.env.cr.execute('select * from hello where id = %s' % my_injection_variable) #@
        """)
        with checker_test_object.assertAddsMessages(
            pylint.testutils.MessageTest(
                msg_id="sql-injection",
                node=node,
                line=4,
                col_offset=4,
                end_line=4,
                end_col_offset=84,
            ),
        ): checker_test_object.checker.visit_call(node) 
        node = _odoo_checker_sql_injection.astroid.extract_node("""
        def get_parner(self):
            arg = "aaa"
            my_injection_variable= "aaaaaaaa {test}".format(test="aaa" + arg) #Const
            self.env.cr.execute('select * from hello where id = %s' % my_injection_variable)#@
        """)
        with checker_test_object.assertNoMessages(): checker_test_object.checker.visit_call(node) 

        node = _odoo_checker_sql_injection.astroid.extract_node("""
        def get_parner(self):
            global arg
            my_injection_variable= "aaaaaaaa {test}".format(test="aaa" + arg) #Uninferable
            self.env.cr.execute('select * from hello where id = %s' % my_injection_variable) #@
        """)
        with checker_test_object.assertAddsMessages(
            pylint.testutils.MessageTest(
                msg_id="sql-injection",
                node=node,
                line=5,
                col_offset=4,
                end_line=5,
                end_col_offset=84,
            ),
        ): checker_test_object.checker.visit_call(node) 

        node = _odoo_checker_sql_injection.astroid.extract_node("""
        def get_parner(self):
            def test():
                return "hello world"
            my_injection_variable= "aaaaaaaa {test}".format(test=test()) #Const
            self.env.cr.execute('select * from hello where id = %s' % my_injection_variable) #@
        """)
        with checker_test_object.assertNoMessages(): checker_test_object.checker.visit_call(node) 

        node = _odoo_checker_sql_injection.astroid.extract_node("""
        def get_parner(self):
            arg = "aaa"
            my_injection_variable= Template('$arg').substitute(arg=arg) #Uninferable
            self.env.cr.execute('select * from hello where id = %s' % my_injection_variable) #@
        """)
        with checker_test_object.assertAddsMessages(
            pylint.testutils.MessageTest(
                msg_id="sql-injection",
                node=node,
                line=5,
                col_offset=4,
                end_line=5,
                end_col_offset=84,
            ),
        ): checker_test_object.checker.visit_call(node) 

        node = _odoo_checker_sql_injection.astroid.extract_node("""
        def get_parner(self,arg):
            my_injection_variable= Template('$arg').substitute(arg=arg) #Uninferable
            self.env.cr.execute('select * from hello where id = %s' % my_injection_variable) #@
        """)
        with checker_test_object.assertAddsMessages(
            pylint.testutils.MessageTest(
                msg_id="sql-injection",
                node=node,
                line=4,
                col_offset=4,
                end_line=4,
                end_col_offset=84,
            ),
        ): checker_test_object.checker.visit_call(node) 

        node = _odoo_checker_sql_injection.astroid.extract_node("""
        def get_parner(self,arg):
            my_injection_variable= "aaa" % arg
            self.env.cr.execute('select * from hello where id = %s' % my_injection_variable) #@
        """)
        with checker_test_object.assertAddsMessages(
            pylint.testutils.MessageTest(
                msg_id="sql-injection",
                node=node,
                line=4,
                col_offset=4,
                end_line=4,
                end_col_offset=84,
            ),
        ): checker_test_object.checker.visit_call(node) 
