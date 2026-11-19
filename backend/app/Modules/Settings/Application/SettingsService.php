<?php

namespace App\Modules\Settings\Application;

use App\Modules\Identity\Models\User;
use App\Shared\Contracts\AuditTrail;
use App\Shared\Exceptions\BusinessRuleException;
use App\Shared\Settings\SettingsRepository;
use Illuminate\Support\Facades\DB;

/** Lecture et modification des paramètres par l'administrateur (D-042). */
final class SettingsService
{
    public function __construct(
        private readonly AuditTrail $audit,
        private readonly SettingsRepository $repository,
    ) {}

    /** @return list<array<string, mixed>> Paramètres du catalogue, dans l'ordre d'affichage. */
    public function all(): array
    {
        $rows = DB::table('settings')
            ->leftJoin('users', 'users.id', '=', 'settings.updated_by')
            ->select('settings.key', 'settings.value', 'settings.updated_at', 'users.name AS updated_by_name')
            ->get()
            ->keyBy('key');

        $settings = [];
        foreach (SettingsCatalog::DEFINITIONS as $key => $definition) {
            $row = $rows->get($key);
            $settings[] = [
                'key' => $key,
                'value' => $row === null ? null : json_decode((string) $row->value, true),
                'updated_at' => $row?->updated_at === null ? null : (string) $row->updated_at,
                'updated_by' => $row?->updated_by_name,
            ] + $definition;
        }

        return $settings;
    }

    /** Valeur déjà validée par la requête ; journalisée avec l'ancienne valeur, dans la même transaction. */
    public function update(string $key, mixed $value, User $actor): void
    {
        $definition = SettingsCatalog::definition($key) ?? throw new BusinessRuleException(
            "Ce paramètre n'existe pas.", 'Élément introuvable', 404, 'setting_not_found',
        );
        if (! $definition['editable']) {
            throw new BusinessRuleException(
                'Ce paramètre ne se modifie pas depuis l’écran : il dépend d’une décision de l’hôtel ('.$definition['reference'].').',
                'Paramètre non modifiable',
                409,
                'setting_not_editable',
            );
        }

        DB::transaction(function () use ($key, $value, $actor): void {
            $current = DB::table('settings')->where('key', $key)->lockForUpdate()->value('value');
            $before = $current === null ? null : json_decode((string) $current, true);
            DB::table('settings')->updateOrInsert(['key' => $key], [
                'value' => json_encode($value, JSON_THROW_ON_ERROR),
                'updated_by' => $actor->id,
                'updated_at' => now(),
            ]);
            // La clé d'un paramètre est une chaîne : elle est portée par l'état journalisé (entity_id = 0).
            $this->audit->record('setting.updated', 'setting', 0, ['key' => $key, 'value' => $before], ['key' => $key, 'value' => $value], $actor->id);
        });
        $this->repository->refresh();
    }
}
