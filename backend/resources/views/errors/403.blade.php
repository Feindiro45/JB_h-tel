@extends('errors.layout', ['tone' => 'ko'])

@section('code', '403')
@section('title', 'Accès refusé')
@section('message', 'Vous n’avez pas l’autorisation d’ouvrir cette page.')
@section('hint', 'Si vous pensez qu’il s’agit d’une erreur, contactez l’hôtel.')
@section('actions')
@endsection
