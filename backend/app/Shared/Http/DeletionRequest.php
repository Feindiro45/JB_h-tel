<?php

namespace App\Shared\Http;

use App\Modules\Identity\Models\User;
use Illuminate\Foundation\Http\FormRequest;

/** Suppression définitive (D-058) : le motif est obligatoire et conservé au journal d'audit. */
final class DeletionRequest extends FormRequest
{
    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return ['reason' => ['required', 'string', 'max:255']];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['reason' => 'motif de la suppression'];
    }

    public function reason(): string
    {
        return $this->string('reason')->trim()->toString();
    }

    public function actor(): User
    {
        /** @var User $user */
        $user = $this->user();

        return $user;
    }
}
