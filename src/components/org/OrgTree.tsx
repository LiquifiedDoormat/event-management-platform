import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { OrgNode } from "@/server/services/org";
import { Badge } from "@/components/ui/Layout";

const PERSON_HREF: Partial<Record<OrgNode["role"], (id: string) => string>> = {
  COORDINATOR: (id) => `/coordinators/${id}`,
  CLUSTER_COORDINATOR: (id) => `/coordinators/${id}`,
  OWNER: (id) => `/people/${id}`,
  ADMIN: (id) => `/people/${id}`,
};

/** One card, its own children nested and indented underneath — a simple,
 * accessible stand-in for a visual org chart (no canvas/SVG layout engine). */
async function Node({ node, depth }: { node: OrgNode; depth: number }) {
  const tr = await getTranslations("roles");
  const isHotel = node.role === "HOTEL";
  const href = isHotel ? `/hotels/${node.id}` : PERSON_HREF[node.role]?.(node.id);
  const label = isHotel ? `🏨 ${node.name}` : node.name;

  return (
    <li className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-line bg-surface p-3">
        {href ? (
          <Link href={href} className="text-lg font-semibold text-brand underline">
            {label}
          </Link>
        ) : (
          <span className="text-lg font-semibold">{label}</span>
        )}
        {!isHotel && <Badge>{tr(node.role as Exclude<OrgNode["role"], "ROOT" | "HOTEL">)}</Badge>}
        {node.phone && (
          <a href={`tel:${node.phone}`} className="underline">
            📞 {node.phone}
          </a>
        )}
      </div>
      {node.children.length > 0 && (
        <ul className="ml-6 flex flex-col gap-2 border-l-2 border-line pl-4">
          {node.children.map((c) => (
            <Node key={c.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Reporting hierarchy, rooted at whatever the viewer may see (server computes the scope). */
export async function OrgTree({ root }: { root: OrgNode }) {
  const t = await getTranslations("org");
  if (root.children.length === 0) return <p className="text-muted">{t("empty")}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {root.children.map((c) => (
        <Node key={c.id} node={c} depth={0} />
      ))}
    </ul>
  );
}
