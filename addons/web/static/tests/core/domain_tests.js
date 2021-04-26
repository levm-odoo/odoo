/** @odoo-module **/

import { Domain } from "@web/core/domain";

QUnit.module("domain", {}, () => {
  // ---------------------------------------------------------------------------
  // Basic properties
  // ---------------------------------------------------------------------------
  QUnit.module("Basic Properties");

  QUnit.test("empty", function (assert) {
    assert.ok(new Domain([]).contains({}));
    assert.strictEqual(new Domain([]).toString(), "[]");
    assert.deepEqual(new Domain([]).toList(), []);
  });

  QUnit.test("undefined domain", function (assert) {
    assert.ok(new Domain(undefined).contains({}));
    assert.strictEqual(new Domain(undefined).toString(), "[]");
    assert.deepEqual(new Domain(undefined).toList(), []);
  });

  QUnit.test("simple condition", function (assert) {
    assert.ok(new Domain([["a", "=", 3]]).contains({ a: 3 }));
    assert.notOk(new Domain([["a", "=", 3]]).contains({ a: 5 }));
    assert.strictEqual(new Domain([["a", "=", 3]]).toString(), `[("a", "=", 3)]`);
    assert.deepEqual(new Domain([["a", "=", 3]]).toList(), [["a", "=", 3]]);
  });

  QUnit.test("can be created from domain", function (assert) {
    const domain = new Domain([["a", "=", 3]]);
    assert.strictEqual(new Domain(domain).toString(), `[("a", "=", 3)]`);
  });

  QUnit.test("basic", function (assert) {
    const record = {
      a: 3,
      group_method: "line",
      select1: "day",
      rrule_type: "monthly",
    };
    assert.ok(new Domain([["a", "=", 3]]).contains(record));
    assert.notOk(new Domain([["a", "=", 5]]).contains(record));
    assert.ok(new Domain([["group_method", "!=", "count"]]).contains(record));
    assert.ok(
      new Domain([
        ["select1", "=", "day"],
        ["rrule_type", "=", "monthly"],
      ]).contains(record)
    );
  });

  QUnit.test("or", function (assert) {
    const currentDomain = [
      "|",
      ["section_id", "=", 42],
      "|",
      ["user_id", "=", 3],
      ["member_ids", "in", [3]],
    ];
    const record = {
      section_id: null,
      user_id: null,
      member_ids: null,
    };
    assert.ok(new Domain(currentDomain).contains({ ...record, section_id: 42 }));
    assert.ok(new Domain(currentDomain).contains({ ...record, user_id: 3 }));
    assert.ok(new Domain(currentDomain).contains({ ...record, member_ids: 3 }));
  });

  QUnit.test("not", function (assert) {
    const record = {
      a: 5,
      group_method: "line",
    };
    assert.ok(new Domain(["!", ["a", "=", 3]]).contains(record));
    assert.ok(new Domain(["!", ["group_method", "=", "count"]]).contains(record));
  });

  QUnit.test("toList", function (assert) {
    assert.deepEqual(new Domain([]).toList(), []);
    assert.deepEqual(new Domain([["a", "=", 3]]).toList(), [["a", "=", 3]]);
    assert.deepEqual(
      new Domain([
        ["a", "=", 3],
        ["b", "!=", "4"],
      ]).toList(),
      ["&", ["a", "=", 3], ["b", "!=", "4"]]
    );
    assert.deepEqual(new Domain(["!", ["a", "=", 3]]).toList(), ["!", ["a", "=", 3]]);
  });

  QUnit.test("toString", function (assert) {
    assert.deepEqual(new Domain([]).toString(), `[]`);
    assert.deepEqual(new Domain([["a", "=", 3]]).toString(), `[("a", "=", 3)]`);
    assert.deepEqual(
      new Domain([
        ["a", "=", 3],
        ["b", "!=", "4"],
      ]).toString(),
      `["&", ("a", "=", 3), ("b", "!=", "4")]`
    );
    assert.deepEqual(new Domain(["!", ["a", "=", 3]]).toString(), `["!", ("a", "=", 3)]`);
  });

  QUnit.test("implicit &", function (assert) {
    const domain = new Domain([
      ["a", "=", 3],
      ["b", "=", 4],
    ]);
    assert.notOk(domain.contains({}));
    assert.ok(domain.contains({ a: 3, b: 4 }));
    assert.notOk(domain.contains({ a: 3, b: 5 }));
  });

  QUnit.test("comparison operators", function (assert) {
    assert.ok(new Domain([["a", "=", 3]]).contains({ a: 3 }));
    assert.notOk(new Domain([["a", "=", 3]]).contains({ a: 4 }));
    assert.strictEqual(new Domain([["a", "=", 3]]).toString(), `[("a", "=", 3)]`);
    assert.ok(new Domain([["a", "==", 3]]).contains({ a: 3 }));
    assert.notOk(new Domain([["a", "==", 3]]).contains({ a: 4 }));
    assert.strictEqual(new Domain([["a", "==", 3]]).toString(), `[("a", "==", 3)]`);
    assert.notOk(new Domain([["a", "!=", 3]]).contains({ a: 3 }));
    assert.ok(new Domain([["a", "!=", 3]]).contains({ a: 4 }));
    assert.strictEqual(new Domain([["a", "!=", 3]]).toString(), `[("a", "!=", 3)]`);
    assert.notOk(new Domain([["a", "<>", 3]]).contains({ a: 3 }));
    assert.ok(new Domain([["a", "<>", 3]]).contains({ a: 4 }));
    assert.strictEqual(new Domain([["a", "<>", 3]]).toString(), `[("a", "<>", 3)]`);
    assert.notOk(new Domain([["a", "<", 3]]).contains({ a: 5 }));
    assert.notOk(new Domain([["a", "<", 3]]).contains({ a: 3 }));
    assert.ok(new Domain([["a", "<", 3]]).contains({ a: 2 }));
    assert.strictEqual(new Domain([["a", "<", 3]]).toString(), `[("a", "<", 3)]`);
    assert.notOk(new Domain([["a", "<=", 3]]).contains({ a: 5 }));
    assert.ok(new Domain([["a", "<=", 3]]).contains({ a: 3 }));
    assert.ok(new Domain([["a", "<=", 3]]).contains({ a: 2 }));
    assert.strictEqual(new Domain([["a", "<=", 3]]).toString(), `[("a", "<=", 3)]`);
    assert.ok(new Domain([["a", ">", 3]]).contains({ a: 5 }));
    assert.notOk(new Domain([["a", ">", 3]]).contains({ a: 3 }));
    assert.notOk(new Domain([["a", ">", 3]]).contains({ a: 2 }));
    assert.strictEqual(new Domain([["a", ">", 3]]).toString(), `[("a", ">", 3)]`);
    assert.ok(new Domain([["a", ">=", 3]]).contains({ a: 5 }));
    assert.ok(new Domain([["a", ">=", 3]]).contains({ a: 3 }));
    assert.notOk(new Domain([["a", ">=", 3]]).contains({ a: 2 }));
    assert.strictEqual(new Domain([["a", ">=", 3]]).toString(), `[("a", ">=", 3)]`);
  });

  QUnit.test("other operators", function (assert) {
    assert.ok(new Domain([["a", "in", [1, 2, 3]]]).contains({ a: 3 }));
    assert.notOk(new Domain([["a", "in", [1, 2, 3]]]).contains({ a: 5 }));
    assert.notOk(new Domain([["a", "not in", [1, 2, 3]]]).contains({ a: 3 }));
    assert.ok(new Domain([["a", "not in", [1, 2, 3]]]).contains({ a: 5 }));
    assert.ok(new Domain([["a", "like", "abc"]]).contains({ a: "abc" }));
    assert.notOk(new Domain([["a", "like", "abc"]]).contains({ a: "def" }));
    assert.ok(new Domain([["a", "=like", "abc"]]).contains({ a: "abc" }));
    assert.notOk(new Domain([["a", "=like", "abc"]]).contains({ a: "def" }));
    assert.ok(new Domain([["a", "ilike", "abc"]]).contains({ a: "abc" }));
    assert.notOk(new Domain([["a", "ilike", "abc"]]).contains({ a: "def" }));
    assert.ok(new Domain([["a", "=ilike", "abc"]]).contains({ a: "abc" }));
    assert.notOk(new Domain([["a", "=ilike", "abc"]]).contains({ a: "def" }));
  });

  QUnit.test("creating a domain with a string expression", function (assert) {
    assert.strictEqual(new Domain(`[('a', '>=', 3)]`).toString(), `[("a", ">=", 3)]`);
    assert.ok(new Domain(`[('a', '>=', 3)]`).contains({ a: 5 }));
  });

  QUnit.test("can evaluate a python expression", function (assert) {
    assert.deepEqual(new Domain(`[('date', '!=', False)]`).toList(), [["date", "!=", false]]);
    assert.deepEqual(new Domain(`[('date', '!=', False)]`).toList(), [["date", "!=", false]]);
    assert.deepEqual(new Domain(`[('date', '!=', 1 + 2)]`).toString(), `[("date", "!=", 1 + 2)]`);
    assert.ok(new Domain(`[('a', '==', 1 + 2)]`).contains({ a: 3 }));
    assert.notOk(new Domain(`[('a', '==', 1 + 2)]`).contains({ a: 2 }));
  });

  QUnit.test("Check that there is no dependency between two domains", function (assert) {
    // The purpose of this test is to verify that a domain created on the basis
    // of another one does not share any dependency.
    const domain1 = new Domain(`[('date', '!=', False)]`);
    const domain2 = new Domain(domain1);
    assert.strictEqual(domain1.toString(), domain2.toString());

    domain2.ast.value.unshift({ type: 1, value: "!" })
    assert.notEqual(domain1.toString(), domain2.toString());
  });

  // ---------------------------------------------------------------------------
  // Normalization
  // ---------------------------------------------------------------------------
  QUnit.module("Normalization");

  QUnit.test("return simple (normalized) domains", function (assert) {
    const domains = ["[]", `[("a", "=", 1)]`, `["!", ("a", "=", 1)]`];
    for (let domain of domains) {
      assert.strictEqual(new Domain(domain).toString(), domain);
    }
  });

  QUnit.test("properly add the & in a non normalized domain", function (assert) {
    assert.strictEqual(
      new Domain(`[("a", "=", 1), ("b", "=", 2)]`).toString(),
      `["&", ("a", "=", 1), ("b", "=", 2)]`
    );
  });

  QUnit.test("normalize domain with ! operator", function (assert) {
    assert.strictEqual(
      new Domain(`["!", ("a", "=", 1), ("b", "=", 2)]`).toString(),
      `["&", "!", ("a", "=", 1), ("b", "=", 2)]`
    );
  });

  // ---------------------------------------------------------------------------
  // Combining domains
  // ---------------------------------------------------------------------------
  QUnit.module("Combining domains");

  QUnit.test("combining zero domain", function (assert) {
    assert.strictEqual(Domain.combine([], "AND").toString(), "[]");
    assert.strictEqual(Domain.combine([], "OR").toString(), "[]");
    assert.ok(Domain.combine([], "AND").contains({ a: 1, b: 2 }));
  });

  QUnit.test("combining one domain", function (assert) {
    assert.strictEqual(Domain.combine([`[("a", "=", 1)]`], "AND").toString(), `[("a", "=", 1)]`);
    assert.strictEqual(
      Domain.combine([`[("user_id", "=", uid)]`], "AND").toString(),
      `[("user_id", "=", uid)]`
    );
    assert.strictEqual(Domain.combine([[["a", "=", 1]]], "AND").toString(), `[("a", "=", 1)]`);
    assert.strictEqual(
      Domain.combine(["[('a', '=', '1'), ('b', '!=', 2)]"], "AND").toString(),
      `["&", ("a", "=", "1"), ("b", "!=", 2)]`
    );
  });

  QUnit.test("combining two domains", function (assert) {
    assert.strictEqual(
      Domain.combine([`[("a", "=", 1)]`, "[]"], "AND").toString(),
      `[("a", "=", 1)]`
    );
    assert.strictEqual(
      Domain.combine([`[("a", "=", 1)]`, []], "AND").toString(),
      `[("a", "=", 1)]`
    );
    assert.strictEqual(
      Domain.combine([new Domain(`[("a", "=", 1)]`), "[]"], "AND").toString(),
      `[("a", "=", 1)]`
    );
    assert.strictEqual(
      Domain.combine([new Domain(`[("a", "=", 1)]`), "[]"], "OR").toString(),
      `[("a", "=", 1)]`
    );
    assert.strictEqual(
      Domain.combine([[["a", "=", 1]], "[('uid', '<=', uid)]"], "AND").toString(),
      `["&", ("a", "=", 1), ("uid", "<=", uid)]`
    );
    assert.strictEqual(
      Domain.combine([[["a", "=", 1]], "[('b', '<=', 3)]"], "OR").toString(),
      `["|", ("a", "=", 1), ("b", "<=", 3)]`
    );
    assert.strictEqual(
      Domain.combine(
        ["[('a', '=', '1'), ('c', 'in', [4, 5])]", "[('b', '<=', 3)]"],
        "OR"
      ).toString(),
      `["|", "&", ("a", "=", "1"), ("c", "in", [4, 5]), ("b", "<=", 3)]`
    );
    assert.strictEqual(
      Domain.combine(
        [new Domain("[('a', '=', '1'), ('c', 'in', [4, 5])]"), "[('b', '<=', 3)]"],
        "OR"
      ).toString(),
      `["|", "&", ("a", "=", "1"), ("c", "in", [4, 5]), ("b", "<=", 3)]`
    );
  });

  QUnit.test("combining three domains", function (assert) {
    assert.strictEqual(
      Domain.combine(
        [
          new Domain("[('a', '=', '1'), ('c', 'in', [4, 5])]"),
          [["b", "<=", 3]],
          `['!', ('uid', '=', uid)]`,
        ],
        "OR"
      ).toString(),
      `["|", "&", ("a", "=", "1"), ("c", "in", [4, 5]), "|", ("b", "<=", 3), "!", ("uid", "=", uid)]`
    );
  });

  // ---------------------------------------------------------------------------
  // OPERATOR AND / OR / NOT
  // ---------------------------------------------------------------------------
  QUnit.module("Operator and/or/not");

  QUnit.test("combining two domains with and/or", function (assert) {
    const domain = new Domain("[('a', '=', 1)]")
    assert.strictEqual(
      domain.and("[]").toString(),
      `[("a", "=", 1)]`
    );
    assert.strictEqual(
      domain.and([]).toString(),
      `[("a", "=", 1)]`
    );
    assert.strictEqual(
      domain.and(new Domain("[]")).toString(),
      `[("a", "=", 1)]`
    );
    assert.strictEqual(
      domain.and( "[('uid', '<=', uid)]").toString(),
      `["&", ("a", "=", 1), ("uid", "<=", uid)]`
    );
    assert.strictEqual(
      domain.and([["b", "<=", 3]]).toString(),
      `["&", ("a", "=", 1), ("b", "<=", 3)]`
    );

    assert.strictEqual(
      domain.or("[]").toString(),
      `[("a", "=", 1)]`
    );
    assert.strictEqual(
      domain.or([]).toString(),
      `[("a", "=", 1)]`
    );
    assert.strictEqual(
      domain.or(new Domain("[]")).toString(),
      `[("a", "=", 1)]`
    );
    assert.strictEqual(
      domain.or( "[('uid', '<=', uid)]").toString(),
      `["|", ("a", "=", 1), ("uid", "<=", uid)]`
    );
    assert.strictEqual(
      domain.or([["b", "<=", 3]]).toString(),
      `["|", ("a", "=", 1), ("b", "<=", 3)]`
    );
  });

  QUnit.test("apply `NOT` on a Domain", function (assert) {
    let domain = new Domain("[('a', '=', 1)]")
    assert.strictEqual(
      domain.not().toString(),
      `["!", ("a", "=", 1)]`
    );
    assert.strictEqual(
      domain.toString(),
      `[("a", "=", 1)]`
    );
    domain = new Domain('[("uid", "<=", uid)]')
    assert.strictEqual(
      domain.not().toString(),
      `["!", ("uid", "<=", uid)]`
    );
    assert.strictEqual(
      domain.toString(),
      `[("uid", "<=", uid)]`
    );
  });
});
