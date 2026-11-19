<?php

namespace App\Shared\Numbering;

use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * Numéros de documents continus et sans trou, par préfixe et par année : `REC-2026-000001`,
 * `FAC-2026-000001`… La ligne de séquence est verrouillée et incrémentée **dans la transaction de
 * l'appelant** : si l'opération échoue, le numéro n'est pas consommé.
 */
final class DocumentNumberer
{
    public function next(string $prefix, ?CarbonInterface $at = null): string
    {
        if (DB::transactionLevel() === 0) {
            throw new LogicException('DocumentNumberer::next() doit être appelé dans une transaction.');
        }

        $year = ($at ?? now())->year;
        $name = strtoupper($prefix).':'.$year;
        $now = now();

        DB::table('document_sequences')->insertOrIgnore(['name' => $name, 'last_number' => 0, 'created_at' => $now, 'updated_at' => $now]);
        $current = (int) DB::table('document_sequences')->where('name', $name)->lockForUpdate()->value('last_number');
        $number = $current + 1;
        DB::table('document_sequences')->where('name', $name)->update(['last_number' => $number, 'updated_at' => $now]);

        return sprintf('%s-%d-%06d', strtoupper($prefix), $year, $number);
    }
}
