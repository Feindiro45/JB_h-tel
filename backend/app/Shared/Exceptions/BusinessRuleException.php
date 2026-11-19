<?php

namespace App\Shared\Exceptions;

use RuntimeException;
use Throwable;

/**
 * Violation d'une règle métier (chambre indisponible, capacité dépassée, remise hors plafond…).
 *
 * Le titre, le message et les détails sont affichés tels quels à l'utilisateur : ils doivent être
 * en français, explicites et sans détail technique. Les détails (liste de phrases) aident à corriger,
 * par exemple « Déjà réservée du 01/12/2026 00:00 au 02/12/2026 00:00 ».
 */
class BusinessRuleException extends RuntimeException
{
    /**
     * @param  list<string>  $details
     */
    public function __construct(
        string $message,
        private readonly string $title = 'Opération impossible',
        private readonly int $status = 422,
        private readonly string $errorCode = 'business_rule_violation',
        private readonly array $details = [],
        ?Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
    }

    public function title(): string
    {
        return $this->title;
    }

    public function status(): int
    {
        return $this->status;
    }

    /** Code stable, exploitable par le frontend sans analyser le texte. */
    public function errorCode(): string
    {
        return $this->errorCode;
    }

    /** @return list<string> */
    public function details(): array
    {
        return $this->details;
    }
}
