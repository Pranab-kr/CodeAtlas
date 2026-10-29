import { Node, SyntaxKind, type SourceFile } from "ts-morph";

/**
 * What a whole-module value is called when its own names aren't all written.
 * `module.exports = makeRouter()` exports one thing nobody named here; showing
 * a partial list of an object literal's keys would claim more than the syntax.
 */
export const WHOLE_MODULE = "module.exports";

/**
 * The names a file exports, read from its own syntax: ESM export statements at
 * the top level, and CommonJS assignments to `module.exports` or `exports`
 * wherever they appear. Source order, each name once.
 */
export function extractExports(sourceFile: SourceFile): string[] {
  const found: { name: string; at: number }[] = [];
  const add = (name: string, at: Node) =>
    found.push({ name, at: at.getStart() });

  for (const statement of sourceFile.getStatements()) {
    if (Node.isExportDeclaration(statement)) {
      // `export * from` names nothing here; `export * as ns from` names ns.
      const namespace = statement.getNamespaceExport();
      if (namespace) {
        add(namespace.getName(), statement);
      }
      for (const specifier of statement.getNamedExports()) {
        add(specifier.getAliasNode()?.getText() ?? specifier.getName(), specifier);
      }
    } else if (Node.isExportAssignment(statement)) {
      // `export = x` is TypeScript's spelling of `module.exports = x`.
      if (statement.isExportEquals()) {
        addWholeModule(statement.getExpression(), add);
      } else {
        add("default", statement);
      }
    } else if (Node.isVariableStatement(statement)) {
      if (!statement.hasExportKeyword()) {
        continue;
      }
      for (const declaration of statement.getDeclarations()) {
        const name = declaration.getNameNode();
        if (Node.isIdentifier(name)) {
          add(name.getText(), name);
          continue;
        }
        // `export const { a, b: c } = x` exports a and c.
        for (const element of name.getDescendantsOfKind(
          SyntaxKind.BindingElement,
        )) {
          const bound = element.getNameNode();
          if (Node.isIdentifier(bound)) {
            add(bound.getText(), bound);
          }
        }
      }
    } else if (
      Node.isFunctionDeclaration(statement) ||
      Node.isClassDeclaration(statement) ||
      Node.isInterfaceDeclaration(statement) ||
      Node.isTypeAliasDeclaration(statement) ||
      Node.isEnumDeclaration(statement) ||
      Node.isModuleDeclaration(statement) ||
      Node.isImportEqualsDeclaration(statement)
    ) {
      if (!statement.hasExportKeyword()) {
        continue;
      }
      if (statement.hasDefaultKeyword()) {
        add("default", statement);
        continue;
      }
      const name = statement.getNameNode();
      // `declare module "x"` is named by a string and exports nothing from this file.
      if (name && Node.isIdentifier(name)) {
        add(name.getText(), name);
      }
    }
  }

  for (const assignment of sourceFile.getDescendantsOfKind(
    SyntaxKind.BinaryExpression,
  )) {
    if (assignment.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
      continue;
    }
    const target = assignment.getLeft();
    if (isModuleExports(target)) {
      addWholeModule(assignment.getRight(), add);
      continue;
    }
    // module.exports.name = …, exports.name = …, and the ["name"] forms.
    if (
      !Node.isPropertyAccessExpression(target) &&
      !Node.isElementAccessExpression(target)
    ) {
      continue;
    }
    const object = target.getExpression();
    if (
      !isModuleExports(object) &&
      !(Node.isIdentifier(object) && object.getText() === "exports")
    ) {
      continue;
    }
    const name = Node.isPropertyAccessExpression(target)
      ? target.getName()
      : literalText(target.getArgumentExpression());
    if (name !== null) {
      add(name, target);
    }
  }

  // Object.defineProperty(exports, "name", …) is how compiled CommonJS writes
  // them. "__esModule" is the compiler's own marker, not something exported.
  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    if (call.getExpression().getText() !== "Object.defineProperty") {
      continue;
    }
    const [object, key] = call.getArguments();
    if (
      !object ||
      !(
        isModuleExports(object) ||
        (Node.isIdentifier(object) && object.getText() === "exports")
      )
    ) {
      continue;
    }
    const name = literalText(key);
    if (name !== null && name !== "__esModule") {
      add(name, call);
    }
  }

  found.sort((left, right) => left.at - right.at);
  return [...new Set(found.map((entry) => entry.name))];
}

// `module.exports = { a, b }` exports a and b. Anything else — a spread, a
// computed key, a function call — is one value whose names aren't all written
// here, so it's recorded as that value rather than as a partial list.
function addWholeModule(
  value: Node,
  add: (name: string, at: Node) => void,
): void {
  if (!Node.isObjectLiteralExpression(value)) {
    add(WHOLE_MODULE, value);
    return;
  }

  const names: { name: string; at: Node }[] = [];
  for (const property of value.getProperties()) {
    if (Node.isSpreadAssignment(property)) {
      add(WHOLE_MODULE, value);
      return;
    }
    const nameNode = property.getNameNode();
    const name = Node.isIdentifier(nameNode)
      ? nameNode.getText()
      : literalText(nameNode);
    if (name === null) {
      add(WHOLE_MODULE, value);
      return;
    }
    names.push({ name, at: property });
  }
  for (const entry of names) {
    add(entry.name, entry.at);
  }
}

function isModuleExports(node: Node): boolean {
  return (
    Node.isPropertyAccessExpression(node) &&
    node.getName() === "exports" &&
    Node.isIdentifier(node.getExpression()) &&
    node.getExpression().getText() === "module"
  );
}

function literalText(node: Node | undefined): string | null {
  return node &&
    (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node))
    ? node.getLiteralValue()
    : null;
}
