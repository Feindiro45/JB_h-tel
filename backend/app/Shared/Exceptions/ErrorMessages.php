<?php

namespace App\Shared\Exceptions;

/**
 * Messages d'erreur destinés aux utilisateurs, en français, sans détail technique.
 * Le frontend possède les mêmes valeurs par défaut (frontend/src/shared/api/errors.ts).
 */
final class ErrorMessages
{
    /** @var array<int, array{title: string, message: string}> */
    private const BY_STATUS = [
        401 => [
            'title' => 'Session expirée',
            'message' => "Votre session a expiré ou vous n'êtes pas connecté. Veuillez vous reconnecter pour continuer.",
        ],
        403 => [
            'title' => 'Accès refusé',
            'message' => "Vous n'avez pas l'autorisation d'effectuer cette opération.",
        ],
        404 => [
            'title' => 'Élément introuvable',
            'message' => "L'élément demandé est introuvable. Il a peut-être été supprimé ou n'existe pas.",
        ],
        405 => [
            'title' => 'Opération non prise en charge',
            'message' => "Cette opération n'est pas disponible à cette adresse.",
        ],
        409 => [
            'title' => 'Opération impossible',
            'message' => "La chambre n'est pas disponible sur cette période ou les données ont été modifiées entre-temps. Actualisez puis réessayez.",
        ],
        419 => [
            'title' => 'Session expirée',
            'message' => 'Votre session a expiré. Rechargez la page puis réessayez.',
        ],
        422 => [
            'title' => 'Données invalides',
            'message' => 'Certaines informations sont incorrectes ou incomplètes. Corrigez les champs signalés puis réessayez.',
        ],
        429 => [
            'title' => 'Trop de demandes',
            'message' => 'Vous avez effectué trop de demandes en peu de temps. Patientez quelques instants puis réessayez.',
        ],
        500 => [
            'title' => 'Incident technique',
            'message' => "Une erreur inattendue est survenue. Réessayez dans quelques instants ; si le problème persiste, contactez l'administrateur.",
        ],
        503 => [
            'title' => 'Service indisponible',
            'message' => 'Le service est temporairement indisponible. Réessayez dans quelques instants.',
        ],
    ];

    private const GENERIC_CLIENT_ERROR = [
        'title' => 'Demande refusée',
        'message' => "La demande n'a pas pu être traitée. Vérifiez les informations saisies puis réessayez.",
    ];

    /**
     * @return array{title: string, message: string}
     */
    public static function forStatus(int $status): array
    {
        return self::BY_STATUS[$status]
            ?? ($status >= 500 ? self::BY_STATUS[500] : self::GENERIC_CLIENT_ERROR);
    }
}
