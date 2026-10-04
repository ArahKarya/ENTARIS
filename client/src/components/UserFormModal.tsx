/**
 * Create / edit a user (Manajemen Pengguna). Dialog with per-field validation
 * that mirrors the server schema; the server still validates and enforces
 * uniqueness. Password is optional on edit (blank = unchanged) and is never
 * read back from the server.
 */
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { roleLabel } from "@/components/shell/role-label";
import {
  validateUserForm,
  type UserFormErrors,
  type UserFormValues,
} from "@/lib/userValidation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/shared";

interface RoleOption {
  key: string;
  name: string;
}

export interface EditableUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  supervisorId?: string | null;
}

const NO_SUPERVISOR = "__none";

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editUser?: EditableUser | null;
}

const emptyForm = (): UserFormValues => ({
  username: "",
  email: "",
  fullName: "",
  password: "",
  role: "Accountant",
});

function apiError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } } };
  return e.response?.data?.error || fallback;
}

export default function UserFormModal({
  isOpen,
  onClose,
  editUser,
}: UserFormModalProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent size="md">
        {/* Content unmounts when closed, so each opening starts from fresh state. */}
        <UserForm
          key={editUser?.id ?? "new"}
          editUser={editUser ?? null}
          onClose={onClose}
          onBusyChange={setBusy}
        />
      </DialogContent>
    </Dialog>
  );
}

interface UserFormProps {
  editUser: EditableUser | null;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}

function UserForm({ editUser, onClose, onBusyChange }: UserFormProps) {
  const isEdit = !!editUser;
  const queryClient = useQueryClient();
  const [form, setForm] = useState<UserFormValues>(() =>
    editUser
      ? {
          username: editUser.username,
          email: editUser.email,
          fullName: editUser.fullName,
          password: "",
          role: editUser.role,
        }
      : emptyForm(),
  );
  const [supervisorId, setSupervisorId] = useState<string>(
    editUser?.supervisorId ?? NO_SUPERVISOR,
  );
  const [errors, setErrors] = useState<UserFormErrors>({});
  const [submitError, setSubmitError] = useState("");

  // Daftar role dinamis (RBAC) untuk dropdown.
  const { data: roleOptions = [] } = useQuery<RoleOption[]>({
    queryKey: ["roles-assignable"],
    queryFn: async () => (await api.get("/roles/assignable")).data,
  });

  // Atasan langsung: approver tahap 1 Pengajuan Pembayaran (tidak boleh diri sendiri).
  const { data: supervisorOptions = [] } = useQuery<
    Array<{ id: string; fullName: string; isActive: boolean }>
  >({
    queryKey: ["users", "supervisor-options"],
    queryFn: async () =>
      (await api.get("/users", { params: { limit: 200, sort: "fullName" } })).data
        .data,
  });

  const set = (field: keyof UserFormValues, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const mutation = useMutation({
    mutationFn: (payload: Record<string, string | null>) =>
      isEdit
        ? api.put(`/users/${editUser!.id}`, payload)
        : api.post("/users", payload),
    onMutate: () => onBusyChange(true),
    onSettled: () => onBusyChange(false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(
        isEdit ? "Data pengguna disimpan." : "Pengguna baru ditambahkan.",
      );
      onClose();
    },
    onError: (err) =>
      setSubmitError(apiError(err, "Gagal menyimpan data pengguna.")),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const next = validateUserForm(form, isEdit);
    setErrors(next);
    setSubmitError("");
    if (Object.keys(next).length > 0) return;
    const payload: Record<string, string | null> = {
      username: form.username.trim(),
      email: form.email.trim(),
      fullName: form.fullName.trim(),
      role: form.role,
      supervisorId: supervisorId === NO_SUPERVISOR ? null : supervisorId,
    };
    if (form.password) payload.password = form.password;
    mutation.mutate(payload);
  };

  const roles: RoleOption[] =
    roleOptions.length > 0
      ? roleOptions
      : form.role
        ? [{ key: form.role, name: roleLabel(form.role) }]
        : [];

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>
          {isEdit ? "Ubah Pengguna" : "Tambah Pengguna"}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? `Mengubah data akun ${editUser!.fullName}.`
            : "Buat akun baru untuk mengakses aplikasi."}
        </DialogDescription>
      </DialogHeader>

      <Field label="Nama lengkap" required error={errors.fullName}>
        <Input
          value={form.fullName}
          onChange={(e) => set("fullName", e.target.value)}
          autoComplete="off"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nama pengguna"
          required
          error={errors.username}
          hint="Dipakai untuk masuk."
        >
          <Input
            value={form.username}
            onChange={(e) => set("username", e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
          />
        </Field>
        <Field label="Email" required error={errors.email}>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            autoComplete="off"
          />
        </Field>
      </div>
      <Field label="Peran" required error={errors.role}>
        {(control) => (
          <Select value={form.role} onValueChange={(v) => set("role", v)}>
            <SelectTrigger {...control}>
              <SelectValue placeholder="Pilih peran" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.key} value={r.key}>
                  {r.name || roleLabel(r.key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field
        label="Atasan langsung"
        hint="Menyetujui Pengajuan Pembayaran pengguna ini sebelum Keuangan. Kosong = langsung ke Keuangan."
      >
        {(control) => (
          <Select value={supervisorId} onValueChange={setSupervisorId}>
            <SelectTrigger {...control}>
              <SelectValue placeholder="Tidak ada" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SUPERVISOR}>Tidak ada</SelectItem>
              {supervisorOptions
                .filter((u) => u.id !== editUser?.id && (u.isActive || u.id === supervisorId))
                .map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.fullName}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field
        label="Kata sandi"
        required={!isEdit}
        error={errors.password}
        hint={
          isEdit
            ? "Kosongkan jika tidak diubah. Minimal 8 karakter, huruf besar, angka dan karakter spesial."
            : "Minimal 8 karakter, berisi huruf besar, angka dan karakter spesial."
        }
      >
        <Input
          type="password"
          value={form.password}
          onChange={(e) => set("password", e.target.value)}
          autoComplete="new-password"
        />
      </Field>

      {submitError && (
        <p
          role="alert"
          className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text"
        >
          {submitError}
        </p>
      )}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={mutation.isPending}
        >
          Batal
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          {isEdit ? "Simpan Perubahan" : "Tambah Pengguna"}
        </Button>
      </DialogFooter>
    </form>
  );
}
