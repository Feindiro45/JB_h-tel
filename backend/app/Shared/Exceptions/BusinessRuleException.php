<?php

namespace App\Shared\Exceptions;

use RuntimeException;
use Throwable;

/**
 * Violation d'une règle métier (chambre indisponible, capacité dépassée, remise hors plafond…).
 *
 * Le titre et le message sont affichés tels quels à l'utilisateur : ils doivent être en français,
 * explicites et sans détail technique. Les modules métier en dérivent leurs exceptions spécifiques.
 */
class BusinessRuleException extends RuntimeException
{
    public function __construct(
        string $message,
        private readonly string $title = 'Opération impossible',
        private readonly int $status = 422,
        private readonly string $errorCode = 'business_rule_violation',
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
}
