import { useEffect, useState } from "react";
import {
  Building2,
  DoorOpen,
  Goal,
  type LucideIcon,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Shirt,
  Trash2,
  Users,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  createResource,
  deleteResource,
  errorMessage,
  listResources,
  updateResource,
} from "../../lib/api";
import {
  Badge,
  Card,
  EmptyState,
  Loading,
  Modal,
  PageHeader,
} from "../../components/ui";
import { AddressAutocomplete } from "../../components/AddressAutocomplete";
import type { Resource, ResourceType } from "../../lib/types";

const typeColor: Record<ResourceType, "brand" | "steel" | "ink" | "slate"> = {
  pitch: "brand",
  dressing_room: "steel",
  room: "ink",
  other: "slate",
};

const typeIcon: Record<ResourceType, LucideIcon> = {
  pitch: Goal,
  dressing_room: Shirt,
  room: DoorOpen,
  other: Building2,
};

export default function ResourcesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const { data: resources = [], isLoading } = useQuery({
    queryKey: ["resources"],
    queryFn: listResources,
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => deleteResource(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }),
  });

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(r: Resource) {
    setEditing(r);
    setOpen(true);
  }

  return (
    <div>
      <PageHeader
        title={t("facilities.title")}
        subtitle={t("facilities.subtitle")}
        actions={
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={16} /> {t("facilities.newFacility")}
          </button>
        }
      />

      {isLoading ? (
        <Loading />
      ) : resources.length === 0 ? (
        <EmptyState
          icon={<Building2 size={32} />}
          title={t("facilities.emptyTitle")}
          description={t("facilities.emptyDesc")}
          action={
            <button className="btn-primary" onClick={openCreate}>
              <Plus size={16} /> {t("facilities.newFacility")}
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resources.map((r) => {
            const Icon = typeIcon[r.type];
            return (
            <Card key={r.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                  <Icon size={20} />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(r)}
                    title={t("common.edit")}
                    className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(t("facilities.confirmDelete", { name: r.name })))
                        removeMut.mutate(r.id);
                    }}
                    title={t("common.delete")}
                    className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <p className="mt-3 font-semibold text-slate-900">{r.name}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Badge color={typeColor[r.type]}>
                  {t(`resourceType.${r.type}`)}
                </Badge>
                {r.capacity != null && (
                  <span className="flex items-center gap-1">
                    <Users size={12} /> {r.capacity}
                  </span>
                )}
              </div>
              {r.location && (
                <div className="mt-3 flex items-start gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <MapPin size={13} className="mt-0.5 shrink-0 text-slate-400" />
                  <span>{r.location}</span>
                </div>
              )}
            </Card>
            );
          })}
        </div>
      )}

      <ResourceFormModal
        open={open}
        resource={editing}
        onClose={() => setOpen(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["resources"] })}
      />
    </div>
  );
}

function ResourceFormModal({
  open,
  resource,
  onClose,
  onSaved,
}: {
  open: boolean;
  resource: Resource | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = !!resource;
  const [name, setName] = useState("");
  const [type, setType] = useState<ResourceType>("pitch");
  const [capacity, setCapacity] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Prefill (or reset) the form each time it is opened.
  useEffect(() => {
    if (!open) return;
    setName(resource?.name ?? "");
    setType(resource?.type ?? "pitch");
    setCapacity(resource?.capacity != null ? String(resource.capacity) : "");
    setLocation(resource?.location ?? "");
    setError(null);
  }, [open, resource]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        type,
        capacity: capacity ? Number(capacity) : null,
        location: location || null,
      };
      return resource
        ? updateResource(resource.id, payload)
        : createResource(payload);
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(isEdit ? "facilities.editTitle" : "facilities.createTitle")}
    >
      <div className="space-y-4">
        <div>
          <label className="label">{t("facilities.name")}</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("facilities.namePlaceholder")}
            autoFocus
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">{t("facilities.type")}</label>
            <select
              className="select"
              value={type}
              onChange={(e) => setType(e.target.value as ResourceType)}
            >
              <option value="pitch">{t("resourceType.pitch")}</option>
              <option value="dressing_room">
                {t("resourceType.dressing_room")}
              </option>
              <option value="room">{t("resourceType.room")}</option>
              <option value="other">{t("resourceType.other")}</option>
            </select>
          </div>
          <div>
            <label className="label">{t("facilities.capacity")}</label>
            <input
              type="number"
              className="input"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="22"
            />
          </div>
          <div>
            <label className="label">{t("facilities.location")}</label>
            <AddressAutocomplete
              value={location}
              onChange={setLocation}
              placeholder={t("facilities.locationPlaceholder")}
            />
          </div>
        </div>
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            className="btn-primary"
            onClick={() => mutation.mutate()}
            disabled={!name || mutation.isPending}
          >
            {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
            {t(isEdit ? "common.save" : "common.create")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
