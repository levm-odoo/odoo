from __future__ import annotations

import copy
import functools
import re
import typing

from odoo.tools import SQL

if typing.TYPE_CHECKING:
    from collections.abc import Callable
    from odoo.tools import Query

    from .fields import Field
    from .models import BaseModel

SQL_EMPTY = SQL()
SQL_ASC = SQL("ASC")
SQL_DESC = SQL("DESC")
SQL_NULLS_FIRST = SQL("NULLS FIRST")
SQL_NULLS_LAST = SQL("NULLS LAST")


order_re = re.compile(r'^(.*)(\s+asc|desc)?(?:\s+nulls\s+(first|last))?$', re.IGNORECASE)
field_split_re = re.compile(r'[\.:]')


# valid SQL aggregation functions
READ_GROUP_AGGREGATE = {
    'sum': lambda table, expr: SQL('SUM(%s)', expr),
    'avg': lambda table, expr: SQL('AVG(%s)', expr),
    'max': lambda table, expr: SQL('MAX(%s)', expr),
    'min': lambda table, expr: SQL('MIN(%s)', expr),
    'bool_and': lambda table, expr: SQL('BOOL_AND(%s)', expr),
    'bool_or': lambda table, expr: SQL('BOOL_OR(%s)', expr),
    'array_agg': lambda table, expr: SQL('ARRAY_AGG(%s ORDER BY %s)', expr, SQL.identifier(table, 'id')),
    # 'recordset' aggregates will be post-processed to become recordsets
    'recordset': lambda table, expr: SQL('ARRAY_AGG(%s ORDER BY %s)', expr, SQL.identifier(table, 'id')),
    'count': lambda table, expr: SQL('COUNT(%s)', expr),
    'count_distinct': lambda table, expr: SQL('COUNT(DISTINCT %s)', expr),
    '__count': lambda table, expr: SQL('COUNT(*)'),
}


class FieldExpression:
    def __init__(self, spec: str) -> None:
        if not spec:
            raise ValueError("Invalid empty function expression")
        self.path = tuple(field_split_re.split(spec))

    def field(self, model: BaseModel) -> Field:
        return model._fields[self.path[0]]

    @property
    def is_single_field(self) -> bool:
        return len(self.path) == 1

    def traverse(self, model: BaseModel, only2one: bool = False) -> tuple[list[tuple[Field, BaseModel]], FieldExpression]:
        # traverse to a related field and return the final expression
        ...

    @functools.cache
    def getters(self, model: BaseModel, check2one: bool = False) -> Callable[[BaseModel], typing.Any]:
        # XXX review all methods here after Domain is merged
        return tuple(self._getter(model, check2one))

    def _getter(self, model: BaseModel, check2one: bool):
        last = len(self.path) - 1
        for index, field_name in enumerate(self.path):
            field = model._fields[field_name]
            getter = field.__get__
            if field.relational:
                if check2one and field.type.endswith('2many') and index < last:
                    raise ValueError("Accepting only many2one in the path")
                model = model.env[field.comodel_name]
            elif index < last:
                # build property access and return
                ...  # TODO
            yield getter

    def __call__(self, record: BaseModel, check2one: bool = False):
        value = record
        for func in self.getters(record, check2one):
            value = func(value)
        return value

    def __repr__(self) -> str:
        return f"FieldExpression{self.path}"

    def __str__(self) -> str:
        return '.'.join(self.path)


class AggregateExpression:
    def __init__(self, spec: str) -> None:
        if spec == '__count':
            self.field_expr = None
            self.aggregate = spec
            return
        function_spec, aggregate = spec.rsplit(':', 1)
        self.field_expr = FieldExpression(function_spec)
        self.aggregate = aggregate

        if self.aggregate not in READ_GROUP_AGGREGATE:
            raise ValueError(f"Invalid aggregate method {self.aggregate!r} for {self!r}.")

    def _to_sql(self, model: BaseModel, query: Query) -> SQL:
        if self.field_expr is None:
            sql_field = SQL()
        else:
            sql_field = model._field_to_sql(model._table, str(self.field_expr), query)
        try:
            return READ_GROUP_AGGREGATE[self.aggregate](model._table, sql_field)
        except KeyError:
            raise ValueError(f"Invalid aggregate method {self.aggregate!r} for {self!r}.")

    def __repr__(self) -> str:
        return f"AggregateExpression({self.field_expr!r}:{self.aggregate})"

    def __str__(self) -> str:
        if self.field_expr is None:
            return self.aggregate
        return f"{self.field_expr}:{self.aggregate}"


class OrderExpression:
    def __init__(self, spec: str) -> None:
        match = order_re.match(spec)
        if not match:
            raise ValueError(f"Invalid order specification {spec!r}")
        self.field_expr = FieldExpression(match[0])
        self.asc = str(match[1]).lower() != 'desc'
        self.nulls = str(match[2]).lower() if match[2] else None

    def reversed(self) -> OrderExpression:
        e = copy.copy(self)
        e.asc = not e.asc
        if e.nulls == 'first':
            e.nulls = 'last'
        if e.nulls == 'last':
            e.nulls = 'first'
        return e

    @property
    def sql_direction(self) -> SQL:
        return SQL_ASC if self.asc else SQL_DESC

    @property
    def sql_nulls(self) -> SQL:
        match self.nulls:
            case 'first':
                return SQL_NULLS_FIRST
            case 'last':
                return SQL_NULLS_LAST
        return SQL_EMPTY

    def _to_sql(self, model: BaseModel, alias: str, query: Query) -> SQL:
        return model._order_field_to_sql(alias, str(self.field_expr), self.sql_direction, self.sql_nulls, query)

    def __repr__(self) -> str:
        direction = 'asc' if self.asc else 'desc'
        nulls = f'nulls {self.nulls}' if self.nulls else ''
        return f"OrderExpression({self.field_expr}, {direction}, {nulls})"

    def __str__(self) -> str:
        direction = 'asc' if self.asc else 'desc'
        result = f"{self.field_expr} {direction}"
        if self.nulls:
            result += f'nulls {self.nulls}'
        return result


class OrderSpecification:
    def __init__(self, order_spec: str) -> None:
        orders = order_spec.split(',')
        self.items = tuple(OrderExpression(order.strip()) for order in orders)

    def __len__(self):
        return len(self.items)

    def __repr__(self) -> str:
        return f"OrderSpecification({self.items})"

    def __str__(self) -> str:
        return ', '.join(str(item) for item in self.items)
