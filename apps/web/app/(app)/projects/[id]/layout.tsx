import { ProjectPageTitle } from "@/app/components/client";
import { projectFor } from "@/lib/data";

// Navigation between a project's pages lives in the sidebar; this is only the header.
export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await projectFor(id);

  return (
    <div className="page">
      <div className="page-head">
        <div className="proj-title">
          <div>
            <p className="crumb">{project.workspaceName} / {project.name}</p>
            <h1><ProjectPageTitle base={`/projects/${id}`} /></h1>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
