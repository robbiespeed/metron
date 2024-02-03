const elementProto = Element.prototype;
const nodeProto = Node.prototype;

export const eReplaceChildren = elementProto.replaceChildren;
export const eReplaceWith = elementProto.replaceWith;
export const eAppend = elementProto.append;
export const nInsertBefore = nodeProto.insertBefore;
export const nAppendChild = nodeProto.appendChild;
export const nCloneNode = nodeProto.cloneNode;
