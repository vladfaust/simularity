export class XmlNode {
  private _name: string;
  private _content: string = "";
  private readonly _attributes: Record<string, string> = {};
  private readonly _children: XmlNode[] = [];
  private _comment: string = "";

  constructor(
    name: string,
    content?: string | null,
    attributes?: Record<string, string>,
    children?: XmlNode[],
    comment?: string,
  ) {
    this._name = name;
    this._content = content ?? "";
    this._attributes = attributes ?? {};
    this._children = children ?? [];
    this._comment = comment ?? "";
  }

  get name(): string {
    return this._name;
  }

  get content(): string {
    return this._content;
  }

  get attributes(): Record<string, string> {
    return this._attributes;
  }

  get children(): XmlNode[] {
    return this._children;
  }

  get comment(): string {
    return this._comment;
  }

  setName(value: string): this {
    this._name = value;
    return this;
  }

  setContent(value: string): this {
    this._content = value;
    return this;
  }

  addAttribute(name: string, value: string): this {
    this._attributes[name] = value;
    return this;
  }

  setComment(value: string): this {
    this._comment = value;
    return this;
  }

  addChild(node: XmlNode): this {
    this._children.push(node);
    return this;
  }

  addChildren(nodes: XmlNode[]): this {
    this._children.push(...nodes);
    return this;
  }

  toString(): string {
    const attributes = Object.entries(this._attributes)
      .map(([key, value]) => `${key}="${value}"`)
      .join(" ");

    const prefix = `${this._comment ? `<!-- ${this._comment} -->` : ""}<${this._name}${
      attributes ? ` ${attributes}` : ""
    }`;

    const content =
      this._content +
      (this._children.length
        ? this._children.map((child) => child.toString()).join("")
        : "");

    if (content) {
      return `${prefix}>${content}</${this._name}>`;
    } else {
      return `${prefix}/>`;
    }
  }
}
